// Client-side checks that mirror the backend rules, so people get instant feedback.
// The backend still validates everything again; it is the source of truth.

function wholeNumber(raw) {
  if (raw === '' || raw === null || raw === undefined) return null
  const number = Number(raw)
  return Number.isInteger(number) ? number : NaN
}

export function validateComplaint(values) {
  const errors = {}
  const title = values.title.trim()
  const description = values.description.trim()
  const location = values.location.trim()

  if (title.length < 3) errors.title = 'Enter a title of at least 3 characters.'
  else if (title.length > 120) errors.title = 'Keep the title under 120 characters.'

  if (description.length < 10) errors.description = 'Describe the problem in at least 10 characters.'
  else if (description.length > 2000) errors.description = 'Keep the description under 2,000 characters.'

  if (!values.category) errors.category = 'Choose a category.'

  if (location.length < 3) errors.location = 'Enter the street, area or landmark (at least 3 characters).'
  else if (location.length > 200) errors.location = 'Keep the location under 200 characters.'

  if (!values.severity) errors.severity = 'Choose how severe the problem is.'

  const people = wholeNumber(values.people_affected)
  if (people === null) errors.people_affected = 'Enter a number. Use 0 if nobody is directly affected.'
  else if (Number.isNaN(people) || people < 0 || people > 1_000_000) {
    errors.people_affected = 'Enter a whole number between 0 and 1,000,000.'
  }

  const previous = wholeNumber(values.previous_complaints)
  if (previous !== null && (Number.isNaN(previous) || previous < 0 || previous > 1000)) {
    errors.previous_complaints = 'Enter a whole number between 0 and 1,000.'
  }
  return errors
}

export function buildPayload(values) {
  return {
    title: values.title.trim(),
    description: values.description.trim(),
    category: values.category,
    location: values.location.trim(),
    location_type: values.location_type,
    severity: Number(values.severity),
    people_affected: Number(values.people_affected),
    previous_complaints: values.previous_complaints === '' ? 0 : Number(values.previous_complaints),
    near_school: values.near_school,
    near_hospital: values.near_hospital,
    traffic_level: values.traffic_level,
  }
}

export const EMPTY_COMPLAINT = {
  title: '',
  description: '',
  category: '',
  location: '',
  location_type: 'other',
  severity: '',
  people_affected: '',
  previous_complaints: '0',
  near_school: false,
  near_hospital: false,
  traffic_level: 'low',
}
