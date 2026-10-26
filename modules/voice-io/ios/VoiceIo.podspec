Pod::Spec.new do |s|
  s.name           = 'VoiceIo'
  s.version        = '0.1.0'
  s.summary        = 'Echo-cancelled capture and playback for the NessaHub assistant voice mode'
  s.author         = 'NessaHub'
  s.homepage       = 'https://example.invalid/voice-io'
  s.license        = { :type => 'Proprietary' }
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.swift'
end
