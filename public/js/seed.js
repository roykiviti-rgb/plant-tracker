// The starting plant list, made from the photos of the plants at home.
// It is loaded only the first time the site opens on a device; after that, edits happen in the app.
// Watering intervals are starting points for autumn in Israel. Adjust them per plant in the app.

const PLANTS = [
  {
    id: 'herbs-a',
    name: 'אדנית אורגנו, לואיזה וטימין',
    location: 'מרפסת',
    intervalDays: 3,
    emoji: '🌿',
    notes: 'צמחי תבלין ים-תיכוניים: להשקות כשהשכבה העליונה של האדמה מתייבשת, בלי להציף.',
  },
  {
    id: 'herbs-b',
    name: 'אדנית מרווה, רוזמרין וזוטה',
    location: 'מרפסת',
    intervalDays: 3,
    emoji: '🌿',
    notes: 'מרווה, רוזמרין וזוטה לבנה אוהבים להתייבש מעט בין השקיות. עדיף מעט יבש מאשר רטוב מדי.',
  },
  {
    id: 'parsley',
    name: 'פטרוזיליה',
    location: 'מרפסת',
    intervalDays: 2,
    emoji: '🌿',
    notes: 'אוהבת אדמה לחה באופן קבוע. בימים חמים כדאי לבדוק כל יום.',
  },
  {
    id: 'oregano',
    name: 'אורגנו',
    location: 'מרפסת',
    intervalDays: 3,
    emoji: '🌿',
    notes: 'להשקות כשהאדמה העליונה יבשה. לא אוהב רגליים רטובות.',
  },
  {
    id: 'salvia',
    name: 'סלוויה סגולה',
    location: 'מרפסת',
    intervalDays: 2,
    emoji: '🪻',
    notes: 'פורחת בשמש. הסרת פרחים שקמלו מעודדת פריחה חדשה.',
  },
  {
    id: 'angelonia',
    name: 'אנג׳לוניה',
    location: 'מרפסת',
    intervalDays: 2,
    emoji: '🌸',
    notes: 'אוהבת שמש מלאה ואדמה לחה מעט. עציץ קטן מתייבש מהר.',
  },
  {
    id: 'zz',
    name: 'זמיוקולקס',
    location: 'בבית',
    intervalDays: 14,
    emoji: '🪴',
    notes: 'עדיף לשכוח מאשר להציף: להשקות רק כשהאדמה יבשה לגמרי.',
  },
  {
    id: 'sansevieria',
    name: 'סנסווריה',
    location: 'בבית',
    intervalDays: 14,
    emoji: '🪴',
    notes: 'עמידה מאוד ליובש. להשקות רק כשהאדמה יבשה לגמרי. מעל רדיאטור האדמה מתייבשת מהר יותר בחורף.',
  },
  {
    id: 'sansevieria-hahnii',
    name: 'סנסווריה ננסית',
    location: 'בבית',
    intervalDays: 14,
    emoji: '🪴',
    notes: 'להשקות ליד שולי העציץ ולא לתוך מרכז השושנת, כדי שלא יירקב.',
  },
  {
    id: 'dieffenbachia',
    name: 'דיפנבכיה',
    location: 'בבית',
    intervalDays: 7,
    emoji: '🪴',
    notes: 'להשקות כשכמה סנטימטרים עליונים של האדמה יבשים. המוהל רעיל: להרחיק מחיות מחמד.',
  },
  {
    id: 'birkin',
    name: 'פילודנדרון בירקין',
    location: 'בבית',
    intervalDays: 7,
    emoji: '🪴',
    notes: 'אוהב אור בהיר ועקיף. להשקות כשהשכבה העליונה של האדמה יבשה.',
  },
  {
    id: 'palm',
    name: 'דקל סלון',
    location: 'בבית',
    intervalDays: 7,
    emoji: '🌴',
    notes: 'אוהב אדמה לחה מעט אבל לא רטובה. קצוות עלים חומים הם בדרך כלל סימן לאוויר יבש.',
  },
  {
    id: 'pothos',
    name: 'פוטוס',
    location: 'בבית',
    intervalDays: 7,
    emoji: '🍃',
    notes: 'סלחני מאוד. כשהעלים נראים מעט נבולים, זה הזמן להשקות.',
  },
  {
    id: 'mint',
    name: 'נענע',
    location: 'בבית',
    intervalDays: 2,
    emoji: '🌱',
    notes: 'צמאה מאוד: לא לתת לאדמה להתייבש לגמרי.',
  },
];

export function createSeedState() {
  return {
    version: 1,
    plants: PLANTS.map((p) => ({ ...p, photo: `plants/${p.id}.jpg`, history: [], snoozedUntil: null })),
  };
}
