import AVFoundation
import ExpoModulesCore

/// Echo-cancelled microphone and speaker for the NessaHub assistant's voice mode. Ported from the
/// Bankai care app; the only additions are `writeClip` and `deleteFile`, so the app needs no
/// file-system package to hand clips over.
///
/// expo-audio pins the session to `mode: .default`, which switches the iPhone's voice processing
/// off: the microphone then hears the assistant through the speaker, so the mic had to be closed
/// while it spoke and the customer could not cut in. Here one AVAudioEngine owns both directions
/// with voice processing on (`.voiceChat`), the same echo canceller, noise suppressor and gain
/// control as a phone call. Because the engine plays the reply itself, the canceller knows
/// exactly what to subtract.
///
/// The microphone runs continuously into a short pre-roll; nothing is written to disk until the
/// app decides speech has started (`beginCapture`), and the pre-roll is written first so the
/// opening syllable, the one that triggered detection, is not lost. Clips are 16 kHz mono 16-bit
/// WAV: what the transcriber uses anyway, and a tenth of the size of 48 kHz float.
public class VoiceIoModule: Module {
  private let engine = AVAudioEngine()
  private let player = AVAudioPlayerNode()
  private let lock = NSLock()

  private let captureFormat = AVAudioFormat(
    commonFormat: .pcmFormatInt16, sampleRate: 16_000, channels: 1, interleaved: true)!
  private let playFormat = AVAudioFormat(standardFormatWithSampleRate: 24_000, channels: 1)!
  private static let preRollMaxFrames: AVAudioFrameCount = 16_000 * 2

  private var inputConverter: AVAudioConverter?
  private var preRoll: [AVAudioPCMBuffer] = []
  private var preRollFrames: AVAudioFrameCount = 0
  private var captureFile: AVAudioFile?
  private var captureURL: URL?
  // Everything written to the current capture, kept in memory as well (16 kHz mono 16-bit is
  // 32 KB a second) so a snapshot can be taken without closing the file being recorded.
  private var captured: [AVAudioPCMBuffer] = []
  private var lastLevelAt: TimeInterval = 0
  private var running = false
  private var playing = false
  private var playGeneration = 0
  private var tapCount = 0
  private var secondPeak: Float = -160
  private var secondStart: TimeInterval = 0
  private var configObserver: NSObjectProtocol?

  public func definition() -> ModuleDefinition {
    Name("VoiceIo")
    Events("onLevel", "onPlaybackEnd", "onSpeechWhileMuted")

    AsyncFunction("start") { () throws in
      try self.startEngine()
    }

    AsyncFunction("stop") {
      self.stopEngine()
    }

    Function("beginCapture") { (preRollMs: Int) in
      self.beginCapture(preRollMs: preRollMs)
    }

    AsyncFunction("endCapture") { () -> String? in
      return self.endCapture()
    }

    // The recording so far, as its own WAV, while recording carries on. Lets the app transcribe
    // during short pauses so the words are often ready by the time the customer stops.
    AsyncFunction("snapshotCapture") { () -> String? in
      return self.snapshotCapture()
    }

    Function("cancelCapture") {
      self.lock.lock()
      self.captureFile = nil
      if let url = self.captureURL { try? FileManager.default.removeItem(at: url) }
      self.captureURL = nil
      self.lock.unlock()
    }

    // Resolves with the clip's length in seconds once it is scheduled, so the app can reveal the
    // matching text at the pace it is spoken.
    AsyncFunction("play") { (uri: String) throws -> Double in
      return try self.play(uri: uri)
    }

    // A synthesised clip (base64 mp3 from the server) → a temporary file `play` can read.
    AsyncFunction("writeClip") { (base64: String) throws -> String in
      guard let data = Data(base64Encoded: base64, options: .ignoreUnknownCharacters) else {
        throw VoiceIoError.badUri
      }
      let url = FileManager.default.temporaryDirectory
        .appendingPathComponent("nessa-voice-clip-\(UUID().uuidString).mp3")
      try data.write(to: url)
      return url.absoluteString
    }

    // Only files this module made, in the temporary directory.
    Function("deleteFile") { (uri: String) in
      guard let url = URL(string: uri), url.isFileURL,
        url.lastPathComponent.hasPrefix("nessa-voice-"),
        url.path.hasPrefix(FileManager.default.temporaryDirectory.path)
      else { return }
      try? FileManager.default.removeItem(at: url)
    }

    Function("stopPlayback") {
      self.stopPlayback()
    }

    // While the assistant speaks, the app mutes its own microphone and lets the voice processor
    // listen instead (see installTapAndStart). Unmuted the moment the customer cuts in.
    Function("setInputMuted") { (muted: Bool) in
      if #available(iOS 17.0, *) {
        self.engine.inputNode.isVoiceProcessingInputMuted = muted
      }
    }

    Function("supportsMutedSpeechDetection") { () -> Bool in
      if #available(iOS 17.0, *) { return true }
      return false
    }

    // Diagnostics from the app, into the same device log as the audio levels.
    Function("log") { (message: String) in
      NSLog("[NessaVoice] \(message)")
    }

    OnDestroy {
      self.stopEngine()
    }
  }

  // MARK: engine

  private func startEngine() throws {
    if running { return }
    let session = AVAudioSession.sharedInstance()
    try session.setCategory(
      .playAndRecord, mode: .voiceChat, options: [.defaultToSpeaker, .allowBluetooth])
    try session.setActive(true)

    let input = engine.inputNode
    // Must be set before the engine starts. Enables echo cancellation on the input against
    // everything the engine's output plays.
    try input.setVoiceProcessingEnabled(true)

    engine.attach(player)
    engine.connect(player, to: engine.mainMixerNode, format: playFormat)

    // iOS stops the engine whenever the audio configuration changes — a route change, another
    // app taking audio, and voice processing settling in right after start. Without this the
    // microphone went silent seconds after opening and nothing reported it.
    configObserver = NotificationCenter.default.addObserver(
      forName: .AVAudioEngineConfigurationChange, object: engine, queue: .main
    ) { [weak self] _ in
      NSLog("[VoiceIo] configuration changed; restarting engine")
      self?.restartAfterConfigChange()
    }

    try installTapAndStart()
    running = true
  }

  private func installTapAndStart() throws {
    let input = engine.inputNode
    input.removeTap(onBus: 0)
    let inFormat = input.outputFormat(forBus: 0)
    NSLog("[VoiceIo] input format: \(inFormat)")
    guard inFormat.sampleRate > 0, inFormat.channelCount > 0,
      let converter = AVAudioConverter(from: inFormat, to: captureFormat)
    else {
      NSLog("[VoiceIo] unusable input format")
      throw VoiceIoError.unsupportedFormat
    }
    // Voice processing can report more than one input channel; fold them to mono.
    converter.downmix = true
    inputConverter = converter

    input.installTap(onBus: 0, bufferSize: 1024, format: inFormat) { [weak self] buffer, _ in
      self?.onInput(buffer)
    }

    // Talking over the assistant. Under playback the echo canceller pulls the microphone down
    // to -90..-120 dB, so a customer saying "wait" in a normal voice never registered — only a
    // raised voice got through. The voice processor's own detector works on the raw signal and
    // knows exactly what is being played (it is how calls say "you're muted"); it reports when
    // the customer starts speaking while input is muted.
    if #available(iOS 17.0, *) {
      _ = input.setMutedSpeechActivityEventListener { [weak self] event in
        guard event == .started else { return }
        NSLog("[VoiceIo] speech while muted")
        self?.sendEvent("onSpeechWhileMuted", [:])
      }
    }
    engine.prepare()
    try engine.start()
    NSLog("[VoiceIo] engine started (running=\(engine.isRunning))")
  }

  private func restartAfterConfigChange() {
    guard running else { return }
    do {
      try installTapAndStart()
    } catch {
      NSLog("[VoiceIo] restart failed: \(error)")
    }
  }

  private func stopEngine() {
    if !running { return }
    stopPlayback()
    if let obs = configObserver { NotificationCenter.default.removeObserver(obs) }
    configObserver = nil
    engine.inputNode.removeTap(onBus: 0)
    engine.stop()
    lock.lock()
    captureFile = nil
    preRoll.removeAll()
    preRollFrames = 0
    lock.unlock()
    running = false
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
  }

  // MARK: microphone

  private func onInput(_ buffer: AVAudioPCMBuffer) {
    tapCount += 1
    if tapCount == 1 || tapCount % 200 == 0 {
      NSLog("[VoiceIo] tap #\(tapCount) frames=\(buffer.frameLength) format=\(buffer.format.commonFormat.rawValue)")
    }
    emitLevel(buffer)
    guard let converted = convert(buffer) else { return }
    lock.lock()
    defer { lock.unlock() }
    if let file = captureFile {
      try? file.write(from: converted)
      captured.append(converted)
      return
    }
    preRoll.append(converted)
    preRollFrames += converted.frameLength
    while preRollFrames > Self.preRollMaxFrames, let first = preRoll.first {
      preRollFrames -= first.frameLength
      preRoll.removeFirst()
    }
  }

  private func emitLevel(_ buffer: AVAudioPCMBuffer) {
    let now = Date().timeIntervalSince1970
    if now - lastLevelAt < 0.1 { return }
    lastLevelAt = now
    let n = Int(buffer.frameLength)
    guard n > 0 else { return }
    var sum: Float = 0
    if let data = buffer.floatChannelData?[0] {
      for i in 0..<n { sum += data[i] * data[i] }
    } else if let data = buffer.int16ChannelData?[0] {
      for i in 0..<n {
        let v = Float(data[i]) / 32768
        sum += v * v
      }
    } else if let data = buffer.int32ChannelData?[0] {
      for i in 0..<n {
        let v = Float(data[i]) / 2_147_483_648
        sum += v * v
      }
    } else {
      return
    }
    let rms = sqrt(sum / Float(n))
    let db = rms > 0 ? 20 * log10(rms) : -160
    // The loudest reading of each second, always: a single sample every few seconds missed a
    // customer saying "allow" over and over.
    secondPeak = max(secondPeak, db)
    if now - secondStart >= 1.0 {
      NSLog("[VoiceIo] peak \(Int(secondPeak)) dB playing=\(playing)")
      secondPeak = -160
      secondStart = now
    }
    sendEvent("onLevel", ["db": Double(db), "playing": playing])
  }

  private func convert(_ buffer: AVAudioPCMBuffer) -> AVAudioPCMBuffer? {
    guard let converter = inputConverter else { return nil }
    let ratio = captureFormat.sampleRate / buffer.format.sampleRate
    let capacity = AVAudioFrameCount(Double(buffer.frameLength) * ratio) + 32
    guard let out = AVAudioPCMBuffer(pcmFormat: captureFormat, frameCapacity: capacity) else {
      return nil
    }
    var fed = false
    var error: NSError?
    converter.convert(to: out, error: &error) { _, status in
      if fed {
        status.pointee = .noDataNow
        return nil
      }
      fed = true
      status.pointee = .haveData
      return buffer
    }
    return (error == nil && out.frameLength > 0) ? out : nil
  }

  private func beginCapture(preRollMs: Int) {
    lock.lock()
    defer { lock.unlock() }
    captured.removeAll()
    let url = FileManager.default.temporaryDirectory
      .appendingPathComponent("nessa-voice-\(UUID().uuidString).wav")
    guard
      let file = try? AVAudioFile(
        forWriting: url, settings: captureFormat.settings, commonFormat: .pcmFormatInt16,
        interleaved: true)
    else { return }
    // Write only the most recent preRollMs of what was buffered before speech was detected.
    let wanted = AVAudioFrameCount(max(0, preRollMs) * 16)
    var skip = preRollFrames > wanted ? preRollFrames - wanted : 0
    for buf in preRoll {
      if skip >= buf.frameLength {
        skip -= buf.frameLength
        continue
      }
      skip = 0
      try? file.write(from: buf)
      captured.append(buf)
    }
    preRoll.removeAll()
    preRollFrames = 0
    captureFile = file
    captureURL = url
  }

  private func endCapture() -> String? {
    lock.lock()
    defer { lock.unlock() }
    // Releasing the AVAudioFile finalises the WAV header.
    captureFile = nil
    captured.removeAll()
    let url = captureURL
    captureURL = nil
    return url?.absoluteString
  }

  private func snapshotCapture() -> String? {
    lock.lock()
    let buffers = captured
    lock.unlock()
    guard !buffers.isEmpty else { return nil }
    let url = FileManager.default.temporaryDirectory
      .appendingPathComponent("nessa-voice-snap-\(UUID().uuidString).wav")
    do {
      let file = try AVAudioFile(
        forWriting: url, settings: captureFormat.settings, commonFormat: .pcmFormatInt16,
        interleaved: true)
      for buf in buffers { try file.write(from: buf) }
    } catch {
      return nil
    }
    return url.absoluteString
  }

  // MARK: speaker

  private func play(uri: String) throws -> Double {
    guard running else { throw VoiceIoError.notRunning }
    guard let url = URL(string: uri) else { throw VoiceIoError.badUri }
    let file = try AVAudioFile(forReading: url)
    guard
      let source = AVAudioPCMBuffer(
        pcmFormat: file.processingFormat, frameCapacity: AVAudioFrameCount(file.length))
    else { throw VoiceIoError.unsupportedFormat }
    try file.read(into: source)
    let buffer = try resample(source, to: playFormat)

    let generation = playGeneration
    player.scheduleBuffer(buffer, at: nil, options: [], completionCallbackType: .dataPlayedBack) {
      [weak self] _ in
      DispatchQueue.main.async {
        guard let self = self, self.playGeneration == generation else { return }
        self.playing = false
        self.sendEvent("onPlaybackEnd", [:])
      }
    }
    playing = true
    if !player.isPlaying { player.play() }
    return Double(buffer.frameLength) / buffer.format.sampleRate
  }

  private func stopPlayback() {
    // Bumped first: stop() fires the completion of every scheduled buffer, and those must not
    // be reported as the clip having finished.
    playGeneration += 1
    player.stop()
    playing = false
  }

  private func resample(_ buffer: AVAudioPCMBuffer, to format: AVAudioFormat) throws
    -> AVAudioPCMBuffer
  {
    if buffer.format == format { return buffer }
    guard let converter = AVAudioConverter(from: buffer.format, to: format) else {
      throw VoiceIoError.unsupportedFormat
    }
    converter.downmix = true
    let ratio = format.sampleRate / buffer.format.sampleRate
    let capacity = AVAudioFrameCount(Double(buffer.frameLength) * ratio) + 64
    guard let out = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: capacity) else {
      throw VoiceIoError.unsupportedFormat
    }
    var fed = false
    var error: NSError?
    converter.convert(to: out, error: &error) { _, status in
      if fed {
        status.pointee = .endOfStream
        return nil
      }
      fed = true
      status.pointee = .haveData
      return buffer
    }
    if let error = error { throw error }
    return out
  }
}

enum VoiceIoError: Error {
  case unsupportedFormat
  case notRunning
  case badUri
}
