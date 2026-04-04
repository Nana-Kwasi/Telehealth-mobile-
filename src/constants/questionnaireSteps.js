export const phq9Questions = [
  'Little interest or pleasure in doing things',
  'Feeling down, depressed, or hopeless',
  'Trouble falling or staying asleep, or sleeping too much',
  'Feeling tired or having little energy',
  'Poor appetite or overeating',
  'Feeling bad about yourself',
  'Trouble concentrating on things',
  'Moving or speaking slowly/being fidgety or restless',
  'Thoughts that you would be better off dead or of hurting yourself'
];

export const steps = [
  {
    key: 'country',
    title: 'Where are you located?',
    fields: [
      {
        type: 'country',
        name: 'country',
        label: 'Country'
      }
    ]
  },
  {
    key: 'identity',
    title: 'Identity',
    fields: [
      {
        type: 'select',
        name: 'gender',
        label: 'Gender identity',
        options: ['woman', 'man', 'non-binary', 'transfeminine', 'transmasculine', 'agender', 'I don\'t know', 'prefer not to say', 'other']
      },
      {
        type: 'select',
        name: 'age',
        label: 'Age',
        options: Array.from({length: 88}, (_, i) => (i + 13).toString())
      },
      {
        type: 'select',
        name: 'sexualOrientation',
        label: 'Sexual orientation',
        options: ['straight', 'gay', 'lesbian', 'bi/pan', 'questioning', 'queer', 'asexual', 'I don\'t know', 'prefer not to say', 'other']
      },
      {
        type: 'select',
        name: 'relationshipStatus',
        label: 'Relationship status',
        options: ['Single', 'In a relationship', 'Married', 'Divorced', 'Widowed', 'It\'s complicated', 'Prefer not to say']
      },
      {
        type: 'select',
        name: 'intimacyConcerns',
        label: 'Do you have any problems or worries about intimacy?',
        options: ['Yes, frequently', 'Sometimes', 'Rarely', 'No', 'Prefer not to say']
      }
    ]
  },
  {
    key: 'religion',
    title: 'Religious Affiliation',
    fields: [
      {
        type: 'select',
        name: 'religion',
        label: 'Are you religious?',
        options: ['Yes', 'No', 'Prefer not to say']
      },
      {
        type: 'select',
        name: 'religionType',
        label: 'If yes, which religion?',
        options: ['Christianity', 'Judaism', 'Islam', 'Hinduism', 'Buddhism', 'Other', 'Prefer not to say'],
        showIf: { field: 'religion', value: 'Yes' }
      },
      {
        type: 'select',
        name: 'christianDenomination',
        label: 'If you identify as a Christian, which denomination best describes you?',
        options: [
          'Catholic',
          'Protestant',
          'Orthodox',
          'Baptist',
          'Methodist',
          'Lutheran',
          'Presbyterian',
          'Episcopal',
          'Evangelical',
          'Non-denominational',
          'Other',
          'I\'m not sure'
        ],
        showIf: { field: 'religionType', value: 'Christianity' }
      },
      {
        type: 'select',
        name: 'preferChristianTherapist',
        label: 'Would you like to be matched with a Christian-based therapist?',
        options: ['Yes', 'No', 'I don\'t mind'],
        showIf: { field: 'religionType', value: 'Christianity' }
      }
    ]
  },
  {
    key: 'therapyType',
    title: 'Type of Therapy',
    fields: [
      {
        type: 'multiselect',
        name: 'therapyTypes',
        label: 'What type of therapy are you looking for?',
        options: [
          'Individual therapy',
          'Couples therapy',
          'Family therapy',
          'Group therapy',
          'Teen therapy',
          'LGBTQ+ therapy',
          'Trauma therapy',
          'Anxiety therapy',
          'Depression therapy',
          'Relationship therapy',
          'Grief therapy',
          'Other'
        ]
      }
    ]
  },
  {
    key: 'therapyHistory',
    title: 'Therapy History & Reasons',
    fields: [
      {
        type: 'select',
        name: 'therapyBefore',
        label: 'Have you ever been in therapy before?',
        options: ['Yes', 'No']
      },
      {
        type: 'multiselect',
        name: 'reasonsForTherapy',
        label: 'What led you to consider therapy today?',
        options: [
          'I\'ve been feeling depressed',
          'My mood is interfering with job/school',
          'I am grieving',
          'I\'m experiencing anxiety or panic attacks',
          'I\'m having relationship problems',
          'I\'m dealing with trauma or PTSD',
          'I want to improve my self-esteem',
          'I\'m struggling with stress',
          'I want to understand myself better',
          'Other'
        ]
      }
    ]
  },
  {
    key: 'therapyGoals',
    title: 'Therapy Goals',
    fields: [
      {
        type: 'multiselect',
        name: 'therapyGoals',
        label: 'What are your main goals for therapy?',
        options: [
          'Reduce symptoms of depression',
          'Reduce symptoms of anxiety',
          'Improve relationships',
          'Process trauma or grief',
          'Develop coping skills',
          'Increase self-esteem',
          'Better understand myself',
          'Improve communication',
          'Manage stress better',
          'Other'
        ]
      }
    ]
  },
  {
    key: 'therapistStyle',
    title: 'Therapist Style & Expectations',
    fields: [
      {
        type: 'multiselect',
        name: 'therapistExpectations',
        label: 'What are your expectations from your therapist?',
        options: [
          'Listens actively',
          'Explores your past',
          'Teaches new skills',
          'Assigns homework',
          'Provides direct advice',
          'Helps with problem-solving',
          'Offers emotional support',
          'Challenges your thinking'
        ]
      },
      {
        type: 'select',
        name: 'therapistStyle',
        label: 'What therapist style do you prefer?',
        options: ['Gentle and supportive', 'Direct and challenging', 'Balanced approach']
      },
      {
        type: 'select',
        name: 'sessionStructure',
        label: 'How structured do you want your sessions to be?',
        options: ['Very structured with clear goals', 'Somewhat structured', 'Flexible and free-flowing']
      },
      {
        type: 'select',
        name: 'sessionFrequency',
        label: 'How often would you like to have therapy sessions?',
        options: ['Weekly', 'Every other week', 'Monthly', 'As needed', 'I\'m not sure']
      }
    ]
  },
  {
    key: 'physicalHealth',
    title: 'Physical Health & Habits',
    fields: [
      {
        type: 'select',
        name: 'physicalHealth',
        label: 'How would you rate your physical health?',
        options: ['Good', 'Fair', 'Poor']
      },
      {
        type: 'select',
        name: 'eatingHabits',
        label: 'How would you rate your eating habits?',
        options: ['Good', 'Fair', 'Poor']
      },
      {
        type: 'select',
        name: 'exercise',
        label: 'How often do you exercise?',
        options: ['Daily', '2-3 times per week', 'Once a week', 'Rarely', 'Never']
      }
    ]
  },
  {
    key: 'depression',
    title: 'Depression Screening',
    fields: [
      {
        type: 'select',
        name: 'depression',
        label: 'Are you experiencing overwhelming sadness or depression?',
        options: ['Yes, frequently', 'Sometimes', 'Rarely', 'No']
      }
    ]
  },
  {
    key: 'phq9_1',
    title: 'PHQ-9: Interest & Pleasure',
    fields: [
      {
        type: 'phq9_single',
        name: 'phq9_1',
        label: 'Little interest or pleasure in doing things',
        question: 'Little interest or pleasure in doing things'
      }
    ]
  },
  {
    key: 'phq9_2',
    title: 'PHQ-9: Feeling Down',
    fields: [
      {
        type: 'phq9_single',
        name: 'phq9_2',
        label: 'Feeling down, depressed, or hopeless',
        question: 'Feeling down, depressed, or hopeless'
      }
    ]
  },
  {
    key: 'phq9_3',
    title: 'PHQ-9: Sleep Problems',
    fields: [
      {
        type: 'phq9_single',
        name: 'phq9_3',
        label: 'Trouble falling or staying asleep, or sleeping too much',
        question: 'Trouble falling or staying asleep, or sleeping too much'
      }
    ]
  },
  {
    key: 'phq9_4',
    title: 'PHQ-9: Energy Level',
    fields: [
      {
        type: 'phq9_single',
        name: 'phq9_4',
        label: 'Feeling tired or having little energy',
        question: 'Feeling tired or having little energy'
      }
    ]
  },
  {
    key: 'phq9_5',
    title: 'PHQ-9: Appetite',
    fields: [
      {
        type: 'phq9_single',
        name: 'phq9_5',
        label: 'Poor appetite or overeating',
        question: 'Poor appetite or overeating'
      }
    ]
  },
  {
    key: 'phq9_6',
    title: 'PHQ-9: Self-Worth',
    fields: [
      {
        type: 'phq9_single',
        name: 'phq9_6',
        label: 'Feeling bad about yourself',
        question: 'Feeling bad about yourself'
      }
    ]
  },
  {
    key: 'phq9_7',
    title: 'PHQ-9: Concentration',
    fields: [
      {
        type: 'phq9_single',
        name: 'phq9_7',
        label: 'Trouble concentrating on things',
        question: 'Trouble concentrating on things'
      }
    ]
  },
  {
    key: 'phq9_8',
    title: 'PHQ-9: Movement',
    fields: [
      {
        type: 'phq9_single',
        name: 'phq9_8',
        label: 'Moving or speaking slowly/being fidgety or restless',
        question: 'Moving or speaking slowly/being fidgety or restless'
      }
    ]
  },
  {
    key: 'phq9_9',
    title: 'PHQ-9: Thoughts',
    fields: [
      {
        type: 'phq9_single',
        name: 'phq9_9',
        label: 'Thoughts that you would be better off dead or of hurting yourself',
        question: 'Thoughts that you would be better off dead or of hurting yourself'
      }
    ]
  },
  {
    key: 'suicideRisk',
    title: 'Suicide Risk Assessment',
    fields: [
      {
        type: 'select',
        name: 'lastSuicideThought',
        label: 'When was the last time you thought about suicide?',
        options: [
          'Within the last 24 hours',
          'Within the last week',
          'Within the last month',
          'Within the last year',
          'More than a year ago',
          'Never',
          'Prefer not to say'
        ]
      }
    ]
  },
  {
    key: 'anxiety',
    title: 'Anxiety Screening',
    fields: [
      {
        type: 'select',
        name: 'anxiety',
        label: 'Are you experiencing anxiety, panic attacks, or chronic worry?',
        options: ['Yes, frequently', 'Sometimes', 'Rarely', 'No']
      }
    ]
  },
  {
    key: 'medication',
    title: 'Current Medications',
    fields: [
      {
        type: 'select',
        name: 'currentMedication',
        label: 'Are you currently taking any medication?',
        options: ['Yes', 'No', 'I\'m not sure']
      }
    ]
  },
  {
    key: 'chronicPain',
    title: 'Physical Health & Pain',
    fields: [
      {
        type: 'select',
        name: 'chronicPain',
        label: 'Are you currently experiencing any chronic pain?',
        options: ['Yes, severe pain', 'Yes, moderate pain', 'Yes, mild pain', 'No', 'I\'m not sure']
      }
    ]
  },
  {
    key: 'dailyLiving',
    title: 'Daily Living & Financial',
    fields: [
      {
        type: 'select',
        name: 'financialStatus',
        label: 'How would you rate your current financial status?',
        options: ['Good', 'Fair', 'Poor']
      },
      {
        type: 'select',
        name: 'employment',
        label: 'Are you currently employed?',
        options: ['Yes, full-time', 'Yes, part-time', 'Self-employed', 'Unemployed', 'Student', 'Retired']
      },
      {
        type: 'select',
        name: 'workSchoolImpact',
        label: 'How much are your symptoms affecting your work or school performance?',
        options: ['Not at all', 'Slightly', 'Moderately', 'Significantly', 'Severely']
      },
      {
        type: 'select',
        name: 'alcohol',
        label: 'How often do you drink alcohol?',
        options: ['Never', 'Rarely', 'Monthly', 'Weekly', 'Daily']
      },
      {
        type: 'select',
        name: 'sleep',
        label: 'How would you rate your sleep quality?',
        options: ['Good', 'Fair', 'Poor']
      }
    ]
  },
  {
    key: 'communication',
    title: 'Communication & Preferences',
    fields: [
      {
        type: 'select',
        name: 'communicationPreference',
        label: 'How do you prefer to communicate with your therapist?',
        options: ['Mostly messaging', 'Mostly phone/video sessions', 'Equal mix of both']
      },
      {
        type: 'select',
        name: 'therapistGender',
        label: 'Do you have a preference for your therapist\'s gender?',
        options: ['No preference', 'Female', 'Male', 'Non-binary']
      },
      {
        type: 'select',
        name: 'lgbtqia',
        label: 'Would you prefer a therapist who is LGBTQIA+ affirming?',
        options: ['Yes, this is important to me', 'No preference', 'I\'m not sure']
      },
      {
        type: 'select',
        name: 'supportSystem',
        label: 'How would you rate your current support system (family, friends, etc.)?',
        options: ['Very supportive', 'Somewhat supportive', 'Not very supportive', 'I don\'t have much support', 'I\'m not sure']
      }
    ]
  },
  {
    key: 'resources',
    title: 'Resources & Support',
    fields: [
      {
        type: 'multiselect',
        name: 'usefulResources',
        label: 'Which of the following resources would be useful for you?',
        options: [
          'Crisis hotline information',
          'Self-help exercises',
          'Meditation and mindfulness',
          'Support group information',
          'Educational materials',
          'Coping strategies',
          'None of the above'
        ]
      },
      {
        type: 'select',
        name: 'crisisSupport',
        label: 'Do you have someone you can call if you\'re in crisis?',
        options: ['Yes, multiple people', 'Yes, one person', 'No, but I have crisis hotlines', 'No', 'I\'m not sure']
      }
    ]
  },
  {
    key: 'availability',
    title: 'Availability & Scheduling',
    fields: [
      {
        type: 'multiselect',
        name: 'availableTimes',
        label: 'What times are you typically available for therapy sessions?',
        options: [
          'Early morning (6 AM - 9 AM)',
          'Morning (9 AM - 12 PM)',
          'Afternoon (12 PM - 5 PM)',
          'Evening (5 PM - 8 PM)',
          'Late evening (8 PM - 11 PM)',
          'Weekends',
          'I\'m flexible'
        ]
      }
    ]
  },
  {
    key: 'financialAid',
    title: 'Financial Aid & Demographics',
    fields: [
      {
        type: 'multiselect',
        name: 'demographics',
        label: 'Which of the following apply to you?',
        options: [
          'Student',
          'Veteran',
          'Low-income',
          'Disabled',
          'Unemployed',
          'None of the above'
        ]
      },
      {
        type: 'select',
        name: 'insurance',
        label: 'Do you have health insurance?',
        options: ['Yes', 'No', 'I\'m not sure']
      }
    ]
  }
];
