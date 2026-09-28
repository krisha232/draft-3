// Areas of study alumni can pick from. Students sort alumni by these.
// Add or rename entries here any time; no database change is needed.
export const FIELDS = [
  'Engineering & Technology',
  'Computer Science & IT',
  'Medicine & Health Sciences',
  'Pure Sciences (Physics, Chemistry, Biology, Maths)',
  'Commerce & Accounting',
  'Economics & Finance',
  'Business & Management',
  'Law',
  'Design',
  'Architecture',
  'Arts & Humanities',
  'Psychology',
  'Social Sciences',
  'Media & Communication',
  'Performing & Fine Arts',
  'Hospitality & Culinary Arts',
  'Education',
  'Sports',
  'Other',
];

// "B.Tech Computer Science, IIT Madras"
export function studyLine(p) {
  return [p.major, p.university].filter(Boolean).join(', ');
}

// Does an alumnus match what a student is looking for?
export function matchesStudy(p, field, text) {
  if (field && p.field !== field) return false;
  if (text) {
    const hay = `${p.major || ''} ${p.subjects || ''} ${p.university || ''} ${p.field || ''}`.toLowerCase();
    if (!hay.includes(text.toLowerCase().trim())) return false;
  }
  return true;
}
