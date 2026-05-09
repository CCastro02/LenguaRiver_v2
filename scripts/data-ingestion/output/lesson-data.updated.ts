export type LessonWordType = "core" | "interest";
export type LessonLanguage = "es" | "ru";
export type InterestTopic = "engineering" | "fitness" | "business" | "travel";
export type LessonFormality = "formal" | "informal" | "neutral";
export type LessonGender = "masculine" | "feminine" | "neuter" | "none";
export type LessonTrackType = "core" | "language-specific" | "interest";
export type LessonSpecializationType =
  | "formal-informal"
  | "script"
  | "politeness"
  | "grammar-pattern"
  | "culture"
  | "dialect";
export type LessonPartOfSpeech =
  | "noun"
  | "verb"
  | "adjective"
  | "phrase"
  | "preposition"
  | "pronoun"
  | "other";
export type LessonImageability = "high" | "medium" | "low";
export type LessonRepetitionPriority = "high" | "medium" | "low";

export type LessonWord = {
  text: string;
  phonetic?: string;
  translation: string;
  acceptedMeanings?: string[];
  type: LessonWordType;
  formality: LessonFormality;
  gender?: LessonGender;
  genderNote?: string;
  contextLabel?: string;
  contextNote?: string;
  interestTopic?: InterestTopic;
  partOfSpeech: LessonPartOfSpeech;
  imageability: LessonImageability;
  repetitionPriority: LessonRepetitionPriority;
  image?: string;
};

type RawLessonWord = {
  text: string;
  phonetic?: string;
  translation: string;
  acceptedMeanings?: string[];
  type: LessonWordType;
  formality?: LessonFormality;
  gender?: LessonGender;
  genderNote?: string;
  contextLabel?: string;
  contextNote?: string;
  interestTopic?: InterestTopic;
  partOfSpeech?: LessonPartOfSpeech;
  imageability?: LessonImageability;
  repetitionPriority?: LessonRepetitionPriority;
  image?: string;
};

export type LessonSentence = {
  text: string;
  phonetic?: string;
  translation: string;
  formality: LessonFormality;
  contextLabel?: string;
  contextNote?: string;
  audioPlaceholder: string;
  words: LessonWord[];
};

type RawLessonSentence = {
  text: string;
  phonetic?: string;
  translation: string;
  formality?: LessonFormality;
  contextLabel?: string;
  contextNote?: string;
  audioPlaceholder: string;
  words: RawLessonWord[];
};

export type Lesson = {
  id: string;
  language: LessonLanguage;
  title: string;
  topic: string;
  trackType: LessonTrackType;
  required: boolean;
  specializationType?: LessonSpecializationType;
  interestTopic?: InterestTopic;
  objective: string;
  coreWords: string[];
  interestWords: string[];
  sentences: LessonSentence[];
};
type RawLesson = {
  id: string;
  language: LessonLanguage;
  title: string;
  topic: string;
  trackType?: LessonTrackType;
  required?: boolean;
  specializationType?: LessonSpecializationType;
  interestTopic?: InterestTopic;
  objective: string;
  coreWords: string[];
  interestWords: string[];
  sentences: RawLessonSentence[];
};

const rawLessons: RawLesson[] = [
  {
    id: "lesson-1",
    language: "es",
    title: "Restaurant Ordering Basics",
    topic: "Ordering Food",
    objective:
      "Order a meal naturally in a restaurant by asking for a table, reading options, and paying.",
    coreWords: [
      "quiero",
      "la cuenta",
      "por favor",
      "para mi",
      "me trae",
      "el menu",
    ],
    interestWords: ["sin cebolla", "picante"],
    sentences: [
      {
        text: "Buenas tardes, quiero una mesa para dos, por favor.",
        translation: "Good afternoon, I want a table for two, please.",
        audioPlaceholder: "[Audio coming soon]",
        words: [
          { text: "buenas tardes", translation: "good afternoon", type: "core" },
          { text: "quiero", translation: "I want", type: "core", image: "/images/chunks/quiero.png" },
          { text: "una mesa", translation: "a table", type: "core", image: "/images/chunks/mesa.png" },
          { text: "para dos", translation: "for two", type: "core" },
          {
            text: "por favor",
            translation: "please",
            acceptedMeanings: ["please", "if you please", "would you please"],
            type: "core",
          },
        ],
      },
      {
        text: "Me trae el menu, por favor?",
        translation: "Can you bring me the menu, please?",
        audioPlaceholder: "[Audio coming soon]",
        words: [
          { text: "me trae", translation: "bring me", type: "core" },
          { text: "el menu", translation: "the menu", type: "core", image: "/images/chunks/menu.png" },
          {
            text: "por favor",
            translation: "please",
            acceptedMeanings: ["please", "if you please", "would you please"],
            type: "core",
          },
        ],
      },
      {
        text: "Para mi, quiero la sopa y el pollo, sin cebolla.",
        translation: "For me, I want the soup and the chicken, without onion.",
        audioPlaceholder: "[Audio coming soon]",
        words: [
          { text: "para mi", translation: "for me", type: "core" },
          { text: "quiero", translation: "I want", type: "core" },
          {
            text: "la sopa",
            translation: "the soup",
            type: "core",
            gender: "feminine",
            genderNote: "la sopa = feminine noun phrase",
          },
          {
            text: "el pollo",
            translation: "the chicken",
            type: "core",
            gender: "masculine",
            genderNote: "el pollo = masculine noun phrase",
          },
          {
            text: "sin cebolla",
            translation: "without onion",
            type: "interest",
            image: "/images/chunks/sin-cebolla.png",
          },
        ],
      },
      {
        text: "Y para mi, quiero arroz y agua, por favor.",
        translation: "And for me, I want rice and water, please.",
        audioPlaceholder: "[Audio coming soon]",
        words: [
          { text: "para mi", translation: "for me", type: "core" },
          { text: "quiero", translation: "I want", type: "core" },
          { text: "arroz", translation: "rice", type: "core" },
          { text: "agua", translation: "water", type: "core" },
          { text: "por favor", translation: "please", type: "core" },
        ],
      },
      {
        text: "La salsa es picante?",
        translation: "Is the sauce spicy?",
        audioPlaceholder: "[Audio coming soon]",
        words: [
          { text: "la salsa", translation: "the sauce", type: "core" },
          { text: "es", translation: "is", type: "core" },
          { text: "picante", translation: "spicy", type: "interest", image: "/images/chunks/picante.png" },
        ],
      },
      {
        text: "Me trae la cuenta, por favor.",
        translation: "Please bring me the bill.",
        audioPlaceholder: "[Audio coming soon]",
        words: [
          { text: "me trae", translation: "bring me", type: "core" },
          { text: "la cuenta", translation: "the bill", type: "core", image: "/images/chunks/cuenta.png" },
          { text: "por favor", translation: "please", type: "core" },
        ],
      },
    ],
  },
  {
    id: "lesson-2",
    language: "es",
    title: "Hotel Front Desk Basics",
    topic: "Hotel Check-in",
    objective:
      "Complete hotel check-in by confirming reservation details, asking practical questions, and receiving room information.",
    coreWords: [
      "tengo una reserva",
      "a nombre de",
      "mi pasaporte",
      "por favor",
      "a que hora",
      "la habitacion",
    ],
    interestWords: ["con vista", "desayuno incluido"],
    sentences: [
      {
        text: "Buenas noches, tengo una reserva a nombre de Rivera.",
        translation: "Good evening, I have a reservation under Rivera.",
        audioPlaceholder: "[Audio coming soon]",
        words: [
          { text: "buenas noches", translation: "good evening", type: "core" },
          { text: "tengo una reserva", translation: "I have a reservation", type: "core" },
          { text: "a nombre de", translation: "under the name of", type: "core" },
          { text: "Rivera", translation: "Rivera", type: "core" },
        ],
      },
      {
        text: "Claro, me muestra mi pasaporte, por favor?",
        translation: "Of course, can you show me your passport, please?",
        formality: "formal",
        contextLabel: "staff / customer",
        audioPlaceholder: "[Audio coming soon]",
        words: [
          { text: "claro", translation: "of course", type: "core" },
          { text: "me muestra", translation: "can you show me", type: "core" },
          { text: "mi pasaporte", translation: "my passport", type: "core" },
          { text: "por favor", translation: "please", type: "core" },
        ],
      },
      {
        text: "Si, aqui esta mi pasaporte. La habitacion es con vista?",
        translation: "Yes, here is my passport. Is the room with a view?",
        audioPlaceholder: "[Audio coming soon]",
        words: [
          { text: "aqui esta", translation: "here is", type: "core" },
          { text: "mi pasaporte", translation: "my passport", type: "core" },
          { text: "la habitacion", translation: "the room", type: "core" },
          { text: "con vista", translation: "with a view", type: "interest", interestTopic: "travel" },
        ],
      },
      {
        text: "Si, su habitacion es con vista y desayuno incluido.",
        translation: "Yes, your room has a view and breakfast included.",
        formality: "formal",
        contextLabel: "staff / customer",
        audioPlaceholder: "[Audio coming soon]",
        words: [
          {
            text: "su habitacion",
            translation: "your room",
            type: "core",
            formality: "formal",
            contextLabel: "staff / customer",
          },
          { text: "con vista", translation: "with a view", type: "interest", interestTopic: "travel" },
          {
            text: "desayuno incluido",
            translation: "breakfast included",
            type: "interest",
            interestTopic: "travel",
          },
        ],
      },
      {
        text: "Perfecto, a que hora es el desayuno, por favor?",
        translation: "Perfect, what time is breakfast, please?",
        audioPlaceholder: "[Audio coming soon]",
        words: [
          { text: "perfecto", translation: "perfect", type: "core" },
          { text: "a que hora", translation: "at what time", type: "core" },
          { text: "el desayuno", translation: "breakfast", type: "core" },
          { text: "por favor", translation: "please", type: "core" },
        ],
      },
      {
        text: "Es de siete a diez. Aqui tiene la llave de la habitacion.",
        translation: "It is from seven to ten. Here is your room key.",
        formality: "formal",
        contextLabel: "staff / customer",
        audioPlaceholder: "[Audio coming soon]",
        words: [
          { text: "de siete a diez", translation: "from seven to ten", type: "core" },
          { text: "aqui tiene", translation: "here you have", type: "core" },
          { text: "la llave", translation: "the key", type: "core" },
          { text: "la habitacion", translation: "the room", type: "core" },
        ],
      },
    ],
  },
  {
    id: "lesson-3",
    language: "es",
    title: "Personal Introductions",
    topic: "Introducing Yourself",
    objective:
      "Introduce yourself, ask basic personal questions, and continue a short social conversation naturally.",
    coreWords: ["me llamo", "soy de", "trabajo en", "mucho gusto", "y tu", "vivo en"],
    interestWords: ["ingeniera", "fotografia"],
    sentences: [
      {
        text: "Hola, me llamo Ana. Mucho gusto.",
        translation: "Hi, my name is Ana. Nice to meet you.",
        audioPlaceholder: "[Audio coming soon]",
        words: [
          { text: "hola", translation: "hi", type: "core" },
          { text: "me llamo", translation: "my name is", type: "core" },
          {
            text: "mucho gusto",
            translation: "nice to meet you",
            acceptedMeanings: ["nice to meet you", "pleased to meet you", "nice meeting you"],
            type: "core",
          },
        ],
      },
      {
        text: "Mucho gusto, Ana. Yo soy Daniel y soy de Chile.",
        translation: "Nice to meet you, Ana. I am Daniel and I am from Chile.",
        audioPlaceholder: "[Audio coming soon]",
        words: [
          {
            text: "mucho gusto",
            translation: "nice to meet you",
            acceptedMeanings: ["nice to meet you", "pleased to meet you", "nice meeting you"],
            type: "core",
          },
          { text: "yo soy", translation: "I am", type: "core" },
          { text: "soy de", translation: "I am from", type: "core" },
          { text: "Chile", translation: "Chile", type: "core" },
        ],
      },
      {
        text: "Yo vivo en Madrid y trabajo en una escuela.",
        translation: "I live in Madrid and I work at a school.",
        audioPlaceholder: "[Audio coming soon]",
        words: [
          { text: "vivo en", translation: "I live in", type: "core" },
          { text: "trabajo en", translation: "I work at", type: "core" },
          { text: "una escuela", translation: "a school", type: "core" },
        ],
      },
      {
        text: "Que bien. Yo trabajo en una oficina y soy ingeniera.",
        translation: "Great. I work in an office and I am an engineer.",
        audioPlaceholder: "[Audio coming soon]",
        words: [
          { text: "que bien", translation: "great", type: "core" },
          { text: "trabajo en", translation: "I work at", type: "core" },
          { text: "una oficina", translation: "an office", type: "core" },
          { text: "ingeniera", translation: "engineer", type: "interest", interestTopic: "engineering" },
        ],
      },
      {
        text: "Y tu, que haces en tu tiempo libre?",
        translation: "And you, what do you do in your free time?",
        formality: "informal",
        contextLabel: "friend / family",
        contextNote: "Use tú with friends and people your age in casual situations.",
        audioPlaceholder: "[Audio coming soon]",
        words: [
          {
            text: "y tu",
            translation: "and you",
            type: "core",
            formality: "informal",
            contextLabel: "friend / family",
          },
          { text: "que haces", translation: "what do you do", type: "core" },
          { text: "tiempo libre", translation: "free time", type: "core" },
        ],
      },
      {
        text: "Y usted, en que trabaja?",
        translation: "And you, what do you do for work? (formal)",
        formality: "formal",
        contextLabel: "professional",
        contextNote: "Use usted in professional or respectful contexts.",
        audioPlaceholder: "[Audio coming soon]",
        words: [
          {
            text: "y usted",
            translation: "and you (formal)",
            type: "core",
            formality: "formal",
            contextLabel: "professional",
          },
          { text: "en que trabaja", translation: "what do you do for work", type: "core" },
        ],
      },
      {
        text: "Me gusta la fotografia y correr por el parque.",
        translation: "I like photography and running in the park.",
        audioPlaceholder: "[Audio coming soon]",
        words: [
          { text: "me gusta", translation: "I like", type: "core" },
          { text: "fotografia", translation: "photography", type: "interest", interestTopic: "travel" },
          { text: "correr", translation: "to run", type: "core" },
        ],
      },
    ],
  },
  {
    id: "lesson-4",
    language: "es",
    title: "City Navigation",
    topic: "Asking for Directions",
    objective:
      "Ask for and understand basic city directions to reach a destination using common navigation phrases.",
    coreWords: ["donde esta", "como llego", "siga recto", "gire a la derecha", "a la izquierda", "gracias"],
    interestWords: ["el semaforo", "la esquina"],
    sentences: [
      {
        text: "Perdon, donde esta la estacion de tren?",
        translation: "Excuse me, where is the train station?",
        audioPlaceholder: "[Audio coming soon]",
        words: [
          { text: "perdon", translation: "excuse me", type: "core" },
          { text: "donde esta", translation: "where is", type: "core" },
          { text: "la estacion de tren", translation: "the train station", type: "core" },
        ],
      },
      {
        text: "Esta cerca. Como llego desde aqui?",
        translation: "It is close. How do I get there from here?",
        audioPlaceholder: "[Audio coming soon]",
        words: [
          { text: "esta cerca", translation: "it is close", type: "core" },
          { text: "como llego", translation: "how do I get", type: "core" },
          { text: "desde aqui", translation: "from here", type: "core" },
        ],
      },
      {
        text: "Siga recto hasta el semaforo.",
        translation: "Go straight until the traffic light.",
        audioPlaceholder: "[Audio coming soon]",
        words: [
          { text: "siga recto", translation: "go straight", type: "core" },
          { text: "hasta", translation: "until", type: "core" },
          { text: "el semaforo", translation: "the traffic light", type: "interest", interestTopic: "travel" },
        ],
      },
      {
        text: "Luego gire a la derecha en la esquina.",
        translation: "Then turn right at the corner.",
        audioPlaceholder: "[Audio coming soon]",
        words: [
          { text: "luego", translation: "then", type: "core" },
          { text: "gire a la derecha", translation: "turn right", type: "core" },
          { text: "la esquina", translation: "the corner", type: "interest", interestTopic: "travel" },
        ],
      },
      {
        text: "Despues, camine dos cuadras y gire a la izquierda.",
        translation: "After that, walk two blocks and turn left.",
        audioPlaceholder: "[Audio coming soon]",
        words: [
          { text: "despues", translation: "after that", type: "core" },
          { text: "camine dos cuadras", translation: "walk two blocks", type: "core" },
          { text: "a la izquierda", translation: "to the left", type: "core" },
        ],
      },
      {
        text: "Perfecto, muchas gracias por su ayuda.",
        translation: "Perfect, thank you very much for your help.",
        audioPlaceholder: "[Audio coming soon]",
        words: [
          { text: "perfecto", translation: "perfect", type: "core" },
          {
            text: "gracias",
            translation: "thank you",
            acceptedMeanings: ["thank you", "thanks", "many thanks"],
            type: "core",
          },
          { text: "por su ayuda", translation: "for your help", type: "core" },
        ],
      },
    ],
  },
  {
    id: "lesson-5",
    language: "es",
    title: "Work and Free Time",
    topic: "Job & Hobbies",
    objective:
      "Describe your job, ask others about their work, and discuss hobbies in a practical conversation.",
    coreWords: ["en que trabajas", "trabajo como", "me gusta", "en mi tiempo libre", "los fines de semana", "y tu"],
    interestWords: ["programacion", "senderismo"],
    sentences: [
      {
        text: "Hola, en que trabajas actualmente?",
        translation: "Hi, what do you do for work currently?",
        audioPlaceholder: "[Audio coming soon]",
        words: [
          { text: "hola", translation: "hi", type: "core" },
          { text: "en que trabajas", translation: "what do you do for work", type: "core" },
          { text: "actualmente", translation: "currently", type: "core" },
        ],
      },
      {
        text: "Trabajo como diseniador, y tu?",
        translation: "I work as a designer, and you?",
        audioPlaceholder: "[Audio coming soon]",
        words: [
          { text: "trabajo como", translation: "I work as", type: "core" },
          { text: "diseniador", translation: "designer", type: "core" },
          { text: "y tu", translation: "and you", type: "core" },
        ],
      },
      {
        text: "Yo trabajo como profesor y me gusta la programacion.",
        translation: "I work as a teacher and I like programming.",
        audioPlaceholder: "[Audio coming soon]",
        words: [
          { text: "yo trabajo como", translation: "I work as", type: "core" },
          { text: "profesor", translation: "teacher", type: "core" },
          { text: "me gusta", translation: "I like", type: "core" },
          {
            text: "programacion",
            translation: "programming",
            type: "interest",
            interestTopic: "engineering",
          },
        ],
      },
      {
        text: "Que haces en mi tiempo libre?",
        translation: "What do you do in your free time?",
        audioPlaceholder: "[Audio coming soon]",
        words: [
          { text: "que haces", translation: "what do you do", type: "core" },
          { text: "en mi tiempo libre", translation: "in my free time", type: "core" },
        ],
      },
      {
        text: "En mi tiempo libre me gusta leer y hacer senderismo.",
        translation: "In my free time I like reading and hiking.",
        audioPlaceholder: "[Audio coming soon]",
        words: [
          { text: "en mi tiempo libre", translation: "in my free time", type: "core" },
          { text: "me gusta", translation: "I like", type: "core" },
          { text: "senderismo", translation: "hiking", type: "interest", interestTopic: "fitness" },
        ],
      },
      {
        text: "Los fines de semana juego futbol con mis amigos.",
        translation: "On weekends I play soccer with my friends.",
        audioPlaceholder: "[Audio coming soon]",
        words: [
          { text: "los fines de semana", translation: "on weekends", type: "core" },
          { text: "juego futbol", translation: "I play soccer", type: "core" },
          { text: "con mis amigos", translation: "with my friends", type: "core" },
        ],
      },
    ],
  },
  {
    id: "lesson-6",
    language: "ru",
    title: "Cafe Conversation Basics",
    topic: "Ordering Food",
    objective:
      "Order food in Russian by greeting staff, asking for items, and requesting the check naturally.",
    coreWords: ["я хочу", "пожалуйста", "мне", "меню", "счет", "спасибо"],
    interestWords: ["без лука", "острый"],
    sentences: [
      {
        text: "Добрый вечер, я хочу столик на двоих, пожалуйста.",
        phonetic: "dobryi vecher, ya hochu stolik na dvoikh, pozhaluysta",
        translation: "Good evening, I want a table for two, please.",
        audioPlaceholder: "[Audio coming soon]",
        words: [
          { text: "добрый вечер", phonetic: "dobryi vecher", translation: "good evening", type: "core" },
          { text: "я хочу", phonetic: "ya hochu", translation: "I want", type: "core" },
          {
            text: "столик на двоих",
            phonetic: "stolik na dvoikh",
            translation: "a table for two",
            type: "core",
          },
          {
            text: "пожалуйста",
            phonetic: "pozhaluysta",
            translation: "please",
            acceptedMeanings: ["please", "if you please", "would you please"],
            type: "core",
          },
        ],
      },
      {
        text: "Принесите меню, пожалуйста.",
        phonetic: "prinesite menyu, pozhaluysta",
        translation: "Bring the menu, please.",
        audioPlaceholder: "[Audio coming soon]",
        words: [
          { text: "принесите", phonetic: "prinesite", translation: "bring", type: "core" },
          {
            text: "меню",
            phonetic: "menyu",
            translation: "menu",
            type: "core",
            gender: "neuter",
            genderNote: "меню = neuter",
          },
          {
            text: "пожалуйста",
            phonetic: "pozhaluysta",
            translation: "please",
            acceptedMeanings: ["please", "if you please", "would you please"],
            type: "core",
          },
        ],
      },
      {
        text: "Мне, я хочу суп и курицу без лука.",
        phonetic: "mne, ya hochu sup i kuritsu bez luka",
        translation: "For me, I want soup and chicken without onion.",
        audioPlaceholder: "[Audio coming soon]",
        words: [
          { text: "мне", phonetic: "mne", translation: "for me", type: "core" },
          { text: "я хочу", phonetic: "ya hochu", translation: "I want", type: "core" },
          { text: "суп и курицу", phonetic: "sup i kuritsu", translation: "soup and chicken", type: "core" },
          {
            text: "без лука",
            phonetic: "bez luka",
            translation: "without onion",
            type: "interest",
            interestTopic: "travel",
          },
        ],
      },
      {
        text: "Этот соус острый?",
        phonetic: "etot sous ostryi",
        translation: "Is this sauce spicy?",
        audioPlaceholder: "[Audio coming soon]",
        words: [
          { text: "этот соус", phonetic: "etot sous", translation: "this sauce", type: "core" },
          {
            text: "острый",
            phonetic: "ostryi",
            translation: "spicy",
            type: "interest",
            interestTopic: "travel",
          },
        ],
      },
      {
        text: "Принесите счет, пожалуйста.",
        phonetic: "prinesite schet, pozhaluysta",
        translation: "Bring the check, please.",
        audioPlaceholder: "[Audio coming soon]",
        words: [
          { text: "принесите", phonetic: "prinesite", translation: "bring", type: "core" },
          { text: "счет", phonetic: "schet", translation: "check", type: "core" },
          {
            text: "пожалуйста",
            phonetic: "pozhaluysta",
            translation: "please",
            acceptedMeanings: ["please", "if you please", "would you please"],
            type: "core",
          },
        ],
      },
      {
        text: "Спасибо, все было очень вкусно.",
        phonetic: "spasibo, vse bylo ochen vkusno",
        translation: "Thank you, everything was very tasty.",
        audioPlaceholder: "[Audio coming soon]",
        words: [
          {
            text: "спасибо",
            phonetic: "spasibo",
            translation: "thank you",
            acceptedMeanings: ["thank you", "thanks", "many thanks"],
            type: "core",
          },
          { text: "очень вкусно", phonetic: "ochen vkusno", translation: "very tasty", type: "core" },
        ],
      },
    ],
  },
  {
    id: "lesson-7",
    language: "ru",
    title: "Hotel Check-in Basics",
    topic: "Hotel Check-in",
    objective:
      "Check into a hotel in Russian by confirming a reservation, sharing ID, and handling practical front-desk needs.",
    coreWords: ["у меня есть", "бронь", "номер", "паспорт", "пожалуйста", "ключ"],
    interestWords: ["инженер", "проект", "по работе"],
    sentences: [
      {
        text: "Здравствуйте, у меня есть бронь.",
        phonetic: "zdravstvuite, u menya est bron",
        translation: "Hello, I have a reservation.",
        audioPlaceholder: "[Audio coming soon]",
        words: [
          {
            text: "здравствуйте",
            phonetic: "zdravstvuite",
            translation: "hello",
            type: "core",
            partOfSpeech: "other",
            imageability: "low",
            repetitionPriority: "high",
          },
          {
            text: "у меня есть",
            phonetic: "u menya est",
            translation: "I have",
            type: "core",
            partOfSpeech: "phrase",
            imageability: "low",
            repetitionPriority: "high",
          },
          {
            text: "бронь",
            phonetic: "bron",
            translation: "reservation",
            type: "core",
            partOfSpeech: "noun",
            imageability: "medium",
            repetitionPriority: "high",
          },
        ],
      },
      {
        text: "Я хочу номер, пожалуйста.",
        phonetic: "ya hochu nomer, pozhaluysta",
        translation: "I want a room, please.",
        audioPlaceholder: "[Audio coming soon]",
        words: [
          {
            text: "я хочу",
            phonetic: "ya hochu",
            translation: "I want",
            type: "core",
            partOfSpeech: "phrase",
            imageability: "low",
            repetitionPriority: "high",
          },
          {
            text: "номер",
            phonetic: "nomer",
            translation: "room",
            type: "core",
            gender: "masculine",
            genderNote: "номер = masculine",
            partOfSpeech: "noun",
            imageability: "high",
            repetitionPriority: "high",
          },
          {
            text: "пожалуйста",
            phonetic: "pozhaluysta",
            translation: "please",
            acceptedMeanings: ["please", "if you please", "would you please"],
            type: "core",
            partOfSpeech: "other",
            imageability: "low",
            repetitionPriority: "high",
          },
        ],
      },
      {
        text: "Вот мой паспорт.",
        phonetic: "vot moi pasport",
        translation: "Here is my passport.",
        audioPlaceholder: "[Audio coming soon]",
        words: [
          {
            text: "вот",
            phonetic: "vot",
            translation: "here is",
            type: "core",
            partOfSpeech: "other",
            imageability: "low",
            repetitionPriority: "medium",
          },
          {
            text: "мой паспорт",
            phonetic: "moi pasport",
            translation: "my passport",
            type: "core",
            partOfSpeech: "noun",
            imageability: "high",
            repetitionPriority: "high",
          },
        ],
      },
      {
        text: "Меня зовут Карлос.",
        phonetic: "menya zovut karlos",
        translation: "My name is Carlos.",
        audioPlaceholder: "[Audio coming soon]",
        words: [
          {
            text: "меня зовут",
            phonetic: "menya zovut",
            translation: "my name is",
            type: "core",
            partOfSpeech: "phrase",
            imageability: "low",
            repetitionPriority: "high",
          },
          {
            text: "Карлос",
            phonetic: "karlos",
            translation: "Carlos",
            type: "core",
            partOfSpeech: "noun",
            imageability: "medium",
            repetitionPriority: "low",
          },
        ],
      },
      {
        text: "Мне нужен ключ.",
        phonetic: "mne nuzhen klyuch",
        translation: "I need a key.",
        audioPlaceholder: "[Audio coming soon]",
        words: [
          {
            text: "мне нужен",
            phonetic: "mne nuzhen",
            translation: "I need",
            type: "core",
            partOfSpeech: "phrase",
            imageability: "low",
            repetitionPriority: "high",
          },
          {
            text: "ключ",
            phonetic: "klyuch",
            translation: "key",
            type: "core",
            partOfSpeech: "noun",
            imageability: "high",
            repetitionPriority: "high",
          },
        ],
      },
      {
        text: "У меня бронь на две ночи.",
        phonetic: "u menya bron na dve nochi",
        translation: "I have a reservation for two nights.",
        audioPlaceholder: "[Audio coming soon]",
        words: [
          {
            text: "у меня",
            phonetic: "u menya",
            translation: "I have",
            type: "core",
            partOfSpeech: "phrase",
            imageability: "low",
            repetitionPriority: "high",
          },
          {
            text: "бронь",
            phonetic: "bron",
            translation: "reservation",
            type: "core",
            partOfSpeech: "noun",
            imageability: "medium",
            repetitionPriority: "high",
          },
          {
            text: "на две ночи",
            phonetic: "na dve nochi",
            translation: "for two nights",
            type: "core",
            partOfSpeech: "phrase",
            imageability: "medium",
            repetitionPriority: "medium",
          },
        ],
      },
      {
        text: "Я инженер, я здесь по работе.",
        phonetic: "ya inzhener, ya zdes po rabote",
        translation: "I am an engineer, I am here for work.",
        audioPlaceholder: "[Audio coming soon]",
        words: [
          {
            text: "я инженер",
            phonetic: "ya inzhener",
            translation: "I am an engineer",
            type: "interest",
            interestTopic: "engineering",
            partOfSpeech: "phrase",
            imageability: "medium",
            repetitionPriority: "low",
          },
          {
            text: "по работе",
            phonetic: "po rabote",
            translation: "for work",
            type: "interest",
            interestTopic: "engineering",
            partOfSpeech: "phrase",
            imageability: "low",
            repetitionPriority: "low",
          },
        ],
      },
      {
        text: "Я работаю над проектом.",
        phonetic: "ya rabotayu nad proektom",
        translation: "I am working on a project.",
        audioPlaceholder: "[Audio coming soon]",
        words: [
          {
            text: "я работаю",
            phonetic: "ya rabotayu",
            translation: "I work",
            type: "interest",
            interestTopic: "engineering",
            partOfSpeech: "phrase",
            imageability: "low",
            repetitionPriority: "low",
          },
          {
            text: "над проектом",
            phonetic: "nad proektom",
            translation: "on a project",
            type: "interest",
            interestTopic: "engineering",
            partOfSpeech: "phrase",
            imageability: "medium",
            repetitionPriority: "low",
          },
        ],
      },
      {
        text: "Спасибо, вот мой паспорт.",
        phonetic: "spasibo, vot moi pasport",
        translation: "Thank you, here is my passport.",
        audioPlaceholder: "[Audio coming soon]",
        words: [
          {
            text: "спасибо",
            phonetic: "spasibo",
            translation: "thank you",
            acceptedMeanings: ["thank you", "thanks", "many thanks"],
            type: "core",
            partOfSpeech: "other",
            imageability: "low",
            repetitionPriority: "high",
          },
          {
            text: "вот мой паспорт",
            phonetic: "vot moi pasport",
            translation: "here is my passport",
            type: "core",
            partOfSpeech: "phrase",
            imageability: "high",
            repetitionPriority: "high",
          },
        ],
      },
    ],
  },
  {
    id: "lesson-8",
    language: "ru",
    title: "Town Center Directions",
    topic: "Directions",
    objective: "Ask where places are and understand simple directions in a town center.",
    coreWords: ["где", "туалет", "ресторан", "идите", "прямо", "поверните", "налево", "направо"],
    interestWords: [],
    sentences: [
      {
        text: "Где туалет?",
        phonetic: "gde tualet",
        translation: "Where is the bathroom?",
        audioPlaceholder: "[Audio coming soon]",
        words: [
          { text: "где", phonetic: "gde", translation: "where", type: "core" },
          { text: "туалет", phonetic: "tualet", translation: "bathroom", type: "core" },
        ],
      },
      {
        text: "Где ресторан?",
        phonetic: "gde restoran",
        translation: "Where is the restaurant?",
        audioPlaceholder: "[Audio coming soon]",
        words: [
          { text: "где", phonetic: "gde", translation: "where", type: "core" },
          { text: "ресторан", phonetic: "restoran", translation: "restaurant", type: "core" },
        ],
      },
      {
        text: "Идите прямо.",
        phonetic: "idite pryamo",
        translation: "Go straight.",
        audioPlaceholder: "[Audio coming soon]",
        words: [
          { text: "идите", phonetic: "idite", translation: "go", type: "core" },
          { text: "прямо", phonetic: "pryamo", translation: "straight", type: "core" },
        ],
      },
      {
        text: "Поверните налево.",
        phonetic: "poverníte nalevo",
        translation: "Turn left.",
        audioPlaceholder: "[Audio coming soon]",
        words: [
          { text: "поверните", phonetic: "poverníte", translation: "turn", type: "core" },
          { text: "налево", phonetic: "nalevo", translation: "left", type: "core" },
        ],
      },
      {
        text: "Поверните направо.",
        phonetic: "poverníte napravo",
        translation: "Turn right.",
        audioPlaceholder: "[Audio coming soon]",
        words: [
          { text: "поверните", phonetic: "poverníte", translation: "turn", type: "core" },
          { text: "направо", phonetic: "napravo", translation: "right", type: "core" },
        ],
      },
      {
        text: "Это там.",
        phonetic: "eto tam",
        translation: "It is there.",
        audioPlaceholder: "[Audio coming soon]",
        words: [
          { text: "это", phonetic: "eto", translation: "this/it", type: "core" },
          { text: "там", phonetic: "tam", translation: "there", type: "core" },
        ],
      },
    ],
  },
  {
    id: "lesson-ru-formality-1",
    language: "ru",
    title: "Formal and Informal You",
    topic: "Introducing Yourself",
    trackType: "language-specific",
    required: false,
    specializationType: "formal-informal",
    objective: "Use ты and вы correctly in simple introductions and greetings.",
    coreWords: ["ты", "вы", "как тебя зовут", "как вас зовут"],
    interestWords: [],
    sentences: [
      {
        text: "Привет, как тебя зовут?",
        phonetic: "privet, kak tebya zovut",
        translation: "Hi, what is your name? (informal)",
        formality: "informal",
        contextLabel: "friend / family",
        contextNote: "Use informal with friends, family, or peers in casual settings.",
        audioPlaceholder: "[Audio coming soon]",
        words: [
          {
            text: "привет",
            phonetic: "privet",
            translation: "hi",
            type: "core",
            formality: "informal",
            contextLabel: "friend / family",
          },
          {
            text: "как тебя зовут",
            phonetic: "kak tebya zovut",
            translation: "what is your name",
            type: "core",
            formality: "informal",
            contextLabel: "friend / family",
          },
        ],
      },
      {
        text: "Здравствуйте, как вас зовут?",
        phonetic: "zdravstvuite, kak vas zovut",
        translation: "Hello, what is your name? (formal)",
        formality: "formal",
        contextLabel: "stranger / staff",
        contextNote: "Use formal speech when talking to strangers, staff, or elders.",
        audioPlaceholder: "[Audio coming soon]",
        words: [
          {
            text: "здравствуйте",
            phonetic: "zdravstvuite",
            translation: "hello",
            type: "core",
            formality: "formal",
            contextLabel: "stranger / staff",
          },
          {
            text: "как вас зовут",
            phonetic: "kak vas zovut",
            translation: "what is your name",
            type: "core",
            formality: "formal",
            contextLabel: "stranger / staff",
          },
        ],
      },
      {
        text: "Ты студент?",
        phonetic: "ty student",
        translation: "Are you a student? (informal)",
        formality: "informal",
        contextLabel: "friend / family",
        audioPlaceholder: "[Audio coming soon]",
        words: [
          {
            text: "ты",
            phonetic: "ty",
            translation: "you (informal)",
            type: "core",
            formality: "informal",
            contextLabel: "friend / family",
          },
          { text: "студент", phonetic: "student", translation: "student", type: "core" },
        ],
      },
      {
        text: "Вы инженер?",
        phonetic: "vy inzhener",
        translation: "Are you an engineer? (formal)",
        formality: "formal",
        contextLabel: "professional",
        audioPlaceholder: "[Audio coming soon]",
        words: [
          {
            text: "вы",
            phonetic: "vy",
            translation: "you (formal)",
            type: "core",
            formality: "formal",
            contextLabel: "professional",
          },
          { text: "инженер", phonetic: "inzhener", translation: "engineer", type: "core" },
        ],
      },
    ],
  },
  {
    id: "lesson-9",
    language: "ru",
    title: "Shopping Basics",
    topic: "Shopping",
    trackType: "core",
    required: true,
    objective: "Buy items, ask for prices, and complete simple purchases.",
    coreWords: [
      "сколько",
      "это",
      "стоит",
      "я хочу",
      "купить",
      "у вас есть",
      "я беру",
      "картой",
      "или",
      "наличными",
      "пожалуйста",
    ],
    interestWords: [],
    sentences: [
      {
        text: "Сколько это стоит?",
        phonetic: "skolko eto stoit",
        translation: "How much is this?",
        audioPlaceholder: "[Audio coming soon]",
        words: [
          { text: "сколько", phonetic: "skolko", translation: "how much", type: "core" },
          { text: "это", phonetic: "eto", translation: "this", type: "core" },
          { text: "стоит", phonetic: "stoit", translation: "costs", type: "core" },
        ],
      },
      {
        text: "Я хочу купить это.",
        phonetic: "ya khochu kupit eto",
        translation: "I want to buy this.",
        audioPlaceholder: "[Audio coming soon]",
        words: [
          { text: "я хочу", phonetic: "ya khochu", translation: "I want", type: "core" },
          { text: "купить", phonetic: "kupit", translation: "to buy", type: "core" },
          { text: "это", phonetic: "eto", translation: "this", type: "core" },
        ],
      },
      {
        text: "У вас есть это?",
        phonetic: "u vas yest eto",
        translation: "Do you have this?",
        formality: "formal",
        contextLabel: "stranger / staff",
        contextNote: "Use formal you-form with staff and strangers.",
        audioPlaceholder: "[Audio coming soon]",
        words: [
          {
            text: "у вас есть",
            phonetic: "u vas yest",
            translation: "do you have",
            type: "core",
            formality: "formal",
            contextLabel: "stranger / staff",
          },
          { text: "это", phonetic: "eto", translation: "this", type: "core" },
        ],
      },
      {
        text: "Я беру это.",
        phonetic: "ya beru eto",
        translation: "I’ll take this.",
        audioPlaceholder: "[Audio coming soon]",
        words: [
          { text: "я беру", phonetic: "ya beru", translation: "I take / I'll take", type: "core" },
          { text: "это", phonetic: "eto", translation: "this", type: "core" },
        ],
      },
      {
        text: "Картой или наличными?",
        phonetic: "kartoy ili nalichnymi",
        translation: "Card or cash?",
        audioPlaceholder: "[Audio coming soon]",
        words: [
          { text: "картой", phonetic: "kartoy", translation: "by card", type: "core" },
          { text: "или", phonetic: "ili", translation: "or", type: "core" },
          { text: "наличными", phonetic: "nalichnymi", translation: "cash", type: "core" },
        ],
      },
      {
        text: "Картой, пожалуйста.",
        phonetic: "kartoy, pozhaluysta",
        translation: "By card, please.",
        audioPlaceholder: "[Audio coming soon]",
        words: [
          { text: "картой", phonetic: "kartoy", translation: "by card", type: "core" },
          {
            text: "пожалуйста",
            phonetic: "pozhaluysta",
            translation: "please",
            acceptedMeanings: ["please", "if you please", "would you please"],
            type: "core",
          },
        ],
      },
    ],
  },
  {
    id: "lesson-10",
    language: "es",
    title: "Shopping Essentials",
    topic: "Shopping",
    trackType: "core",
    required: true,
    objective: "Ask basic prices and complete simple shopping interactions.",
    coreWords: ["cuanto cuesta", "quiero comprar", "tarjeta", "efectivo"],
    interestWords: [],
    sentences: [
      {
        text: "Cuanto cuesta esto?",
        translation: "How much does this cost?",
        audioPlaceholder: "[Audio coming soon]",
        words: [
          { text: "cuanto cuesta", translation: "how much does it cost", type: "core" },
          { text: "esto", translation: "this", type: "core" },
        ],
      },
    ],
  },
  {
    id: "lesson-11",
    language: "es",
    title: "Emergencies and Help Basics",
    topic: "Emergencies & Help",
    trackType: "core",
    required: true,
    objective: "Request urgent help and describe simple emergency needs.",
    coreWords: ["ayuda", "necesito", "por favor"],
    interestWords: [],
    sentences: [
      {
        text: "Necesito ayuda, por favor.",
        translation: "I need help, please.",
        formality: "formal",
        contextLabel: "stranger / staff",
        audioPlaceholder: "[Audio coming soon]",
        words: [
          { text: "necesito", translation: "I need", type: "core" },
          { text: "ayuda", translation: "help", type: "core" },
          {
            text: "por favor",
            translation: "please",
            acceptedMeanings: ["please", "if you please", "would you please"],
            type: "core",
            formality: "formal",
          },
        ],
      },
    ],
  },
  {
    id: "lesson-12",
    language: "ru",
    title: "Basic Introductions",
    topic: "Introductions",
    trackType: "core",
    required: true,
    objective: "Handle basic introductions in Russian in neutral social situations.",
    coreWords: ["привет", "меня зовут", "как вас зовут"],
    interestWords: [],
    sentences: [
      {
        text: "Привет, меня зовут Анна.",
        phonetic: "privet, menya zovut anna",
        translation: "Hi, my name is Anna.",
        formality: "informal",
        contextLabel: "friend / family",
        audioPlaceholder: "[Audio coming soon]",
        words: [
          { text: "привет", phonetic: "privet", translation: "hi", type: "core", formality: "informal" },
          {
            text: "меня зовут",
            phonetic: "menya zovut",
            translation: "my name is",
            type: "core",
            formality: "informal",
          },
          { text: "Анна", phonetic: "anna", translation: "Anna", type: "core", formality: "informal" },
        ],
      },
    ],
  },
  {
    "id": "draft-es-introductions-and-daily-basics",
    "language": "es",
    "title": "Introductions and Daily Basics",
    "topic": "Introductions and Daily Basics",
    "trackType": "core",
    "required": true,
    "objective": "Practice high-value self-introduction and daily-use chunks with contextual examples.",
    "coreWords": [
      "me llamo",
      "hola",
      "soy de",
      "mucho gusto",
      "y tu"
    ],
    "interestWords": [
      "yo",
      "trabajar",
      "comer",
      "chile",
      "madrid"
    ],
    "sentences": [
      {
        "text": "Hola, me llamo Ana.",
        "translation": "Hi, my name is Ana.",
        "formality": "informal",
        "audioPlaceholder": "[Audio coming soon]",
        "words": [
          {
            "text": "hola",
            "translation": "hello",
            "type": "core",
            "formality": "informal",
            "partOfSpeech": "noun",
            "imageability": "high",
            "repetitionPriority": "high"
          },
          {
            "text": "me llamo",
            "translation": "my name is",
            "type": "core",
            "formality": "informal",
            "partOfSpeech": "phrase",
            "imageability": "medium",
            "repetitionPriority": "high"
          }
        ]
      },
      {
        "text": "Mucho gusto, Ana. Yo soy Daniel y soy de Chile.",
        "translation": "Nice to meet you, Ana. I am Daniel and I am from Chile.",
        "formality": "neutral",
        "audioPlaceholder": "[Audio coming soon]",
        "words": [
          {
            "text": "mucho gusto",
            "translation": "nice to meet you",
            "type": "core",
            "formality": "neutral",
            "partOfSpeech": "phrase",
            "imageability": "medium",
            "repetitionPriority": "high"
          },
          {
            "text": "soy de",
            "translation": "I am from",
            "type": "core",
            "formality": "neutral",
            "partOfSpeech": "phrase",
            "imageability": "medium",
            "repetitionPriority": "high"
          },
          {
            "text": "chile",
            "translation": "Chile",
            "type": "interest",
            "formality": "neutral",
            "partOfSpeech": "noun",
            "imageability": "high",
            "repetitionPriority": "medium"
          }
        ]
      }
    ]
  }
  ,
  {
    id: "lesson-13",
    language: "ru",
    title: "Emergencies and Help Basics",
    topic: "Emergencies & Help",
    trackType: "core",
    required: true,
    objective: "Ask for urgent help in Russian with simple emergency phrases.",
    coreWords: ["помогите", "мне нужна помощь"],
    interestWords: [],
    sentences: [
      {
        text: "Помогите, мне нужна помощь.",
        phonetic: "pomogite, mne nuzhna pomoshch",
        translation: "Help, I need assistance.",
        formality: "formal",
        contextLabel: "stranger / staff",
        audioPlaceholder: "[Audio coming soon]",
        words: [
          { text: "помогите", phonetic: "pomogite", translation: "help", type: "core", formality: "formal" },
          {
            text: "мне нужна помощь",
            phonetic: "mne nuzhna pomoshch",
            translation: "I need assistance",
            type: "core",
            formality: "formal",
          },
        ],
      },
    ],
  },
  {
    id: "lesson-14",
    language: "ru",
    title: "Job and Hobbies Basics",
    topic: "Job & Hobbies",
    trackType: "core",
    required: true,
    objective: "Discuss basic work and hobby information in Russian.",
    coreWords: ["я работаю", "люблю спорт", "в офисе"],
    interestWords: [],
    sentences: [
      {
        text: "Я работаю в офисе и люблю спорт.",
        phonetic: "ya rabotayu v ofise i lyublyu sport",
        translation: "I work in an office and I like sports.",
        audioPlaceholder: "[Audio coming soon]",
        words: [
          { text: "я работаю", phonetic: "ya rabotayu", translation: "I work", type: "core" },
          { text: "в офисе", phonetic: "v ofise", translation: "in an office", type: "core" },
          { text: "люблю спорт", phonetic: "lyublyu sport", translation: "I like sports", type: "core" },
        ],
      },
    ],
  },
];

const PART_OF_SPEECH_OVERRIDES: Record<string, LessonPartOfSpeech> = {
  "quiero": "verb",
  "es": "verb",
  "me trae": "phrase",
  "mi pasaporte": "noun",
  "la habitacion": "noun",
  "y tu": "pronoun",
  "yo soy": "pronoun",
  "soy de": "preposition",
  "vivo en": "verb",
  "trabajo en": "verb",
  "a la izquierda": "preposition",
  "donde esta": "phrase",
  "como llego": "phrase",
  "trabajo como": "verb",
  "en mi tiempo libre": "preposition",
  "ya hochu": "verb",
  "tú": "pronoun",
  "usted": "pronoun",
  "ты": "pronoun",
  "вы": "pronoun",
  "y usted": "pronoun",
  "mne": "pronoun",
  "pozhaluysta": "other",
  "spasibo": "other",
};

const IMAGEABILITY_OVERRIDES: Record<string, LessonImageability> = {
  "por favor": "low",
  "es": "low",
  "y tu": "low",
  "y usted": "low",
  "tú": "low",
  "usted": "low",
  "ты": "low",
  "вы": "low",
  "yo soy": "low",
  "soy de": "low",
  "de siete a diez": "low",
  "a que hora": "low",
  "como llego": "medium",
  "siga recto": "medium",
  "gire a la derecha": "medium",
  "a la izquierda": "medium",
  "donde esta": "medium",
  "en mi tiempo libre": "low",
  "los fines de semana": "low",
  "ya hochu": "medium",
  "pozhaluysta": "low",
  "mne": "low",
};

const REPETITION_PRIORITY_OVERRIDES: Record<string, LessonRepetitionPriority> = {
  "por favor": "high",
  "quiero": "high",
  "me trae": "high",
  "la cuenta": "high",
  "el menu": "high",
  "para mi": "high",
  "tengo una reserva": "high",
  "a nombre de": "high",
  "mi pasaporte": "high",
  "la habitacion": "high",
  "me llamo": "high",
  "mucho gusto": "high",
  "soy de": "high",
  "y tu": "high",
  "y usted": "high",
  "tú": "high",
  "usted": "high",
  "ты": "high",
  "вы": "high",
  "donde esta": "high",
  "como llego": "high",
  "siga recto": "high",
  "gire a la derecha": "high",
  "a la izquierda": "high",
  "en que trabajas": "high",
  "trabajo como": "high",
  "me gusta": "high",
  "en mi tiempo libre": "high",
  "ya hochu": "high",
  "mne": "high",
  "menyu": "high",
  "schet": "high",
  "pozhaluysta": "high",
  "spasibo": "high",
};

const NOUN_HINTS = [
  "menu",
  "mesa",
  "sopa",
  "pollo",
  "agua",
  "salsa",
  "cuenta",
  "pasaporte",
  "habitacion",
  "llave",
  "desayuno",
  "escuela",
  "oficina",
  "fotografia",
  "semaforo",
  "esquina",
  "programacion",
  "senderismo",
  "stolik",
  "sup",
  "kuritsu",
  "schet",
];

function normalizeChunkKey(text: string): string {
  return text.toLowerCase().trim();
}

function inferPartOfSpeech(word: RawLessonWord): LessonPartOfSpeech {
  const key = normalizeChunkKey(word.text);
  if (PART_OF_SPEECH_OVERRIDES[key]) {
    return PART_OF_SPEECH_OVERRIDES[key];
  }
  if (key.includes(" ") || key.includes(",")) {
    return "phrase";
  }
  if (NOUN_HINTS.some((hint) => key.includes(hint))) {
    return "noun";
  }
  return "other";
}

function inferImageability(word: RawLessonWord): LessonImageability {
  const key = normalizeChunkKey(word.text);
  if (IMAGEABILITY_OVERRIDES[key]) {
    return IMAGEABILITY_OVERRIDES[key];
  }
  if (NOUN_HINTS.some((hint) => key.includes(hint))) {
    return "high";
  }
  if (word.type === "interest") {
    return "high";
  }
  return "medium";
}

function inferRepetitionPriority(
  word: RawLessonWord,
  lesson: RawLesson
): LessonRepetitionPriority {
  const key = normalizeChunkKey(word.text);
  if (REPETITION_PRIORITY_OVERRIDES[key]) {
    return REPETITION_PRIORITY_OVERRIDES[key];
  }
  if (lesson.coreWords.some((core) => normalizeChunkKey(core) === key)) {
    return "high";
  }
  if (word.type === "core") {
    return "medium";
  }
  return "low";
}

function enrichWord(word: RawLessonWord, lesson: RawLesson): LessonWord {
  const partOfSpeech = word.partOfSpeech ?? inferPartOfSpeech(word);
  const imageability = word.imageability ?? inferImageability(word);
  const repetitionPriority = word.repetitionPriority ?? inferRepetitionPriority(word, lesson);
  const image = imageability === "low" ? undefined : word.image;
  const formality = word.formality ?? "neutral";
  const gender = word.gender ?? "none";

  return {
    ...word,
    formality,
    gender,
    partOfSpeech,
    imageability,
    repetitionPriority,
    image,
  };
}

export const lessons: Lesson[] = rawLessons.map((lesson) => ({
  ...lesson,
  trackType: lesson.trackType ?? "core",
  required: lesson.required ?? true,
  sentences: lesson.sentences.map((sentence) => ({
    ...sentence,
    formality: sentence.formality ?? "neutral",
    words: sentence.words.map((word) => enrichWord(word, lesson)),
  })),
}));
