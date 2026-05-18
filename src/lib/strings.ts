// Minimal i18n constants. Decision #70 will layer a real i18n library
// on top later; this keeps user-visible strings centralised so the
// migration is a one-shot find-and-replace.
//
// Terminology stays generic on purpose: LANDR is a universal booking
// platform (paragliding, kayak, ski, yoga…). No vertical-specific
// labels here.

export const t = {
  app: {
    name: 'LANDR Operator Dashboard',
  },
  auth: {
    signInHeading: 'Sign in',
    signInDescription: 'Access your operator dashboard.',
    emailLabel: 'Email',
    emailPlaceholder: 'you@operator.example',
    passwordLabel: 'Password',
    passwordPlaceholder: '••••••••',
    submit: 'Sign in',
    submitting: 'Signing in…',
    signOut: 'Sign out',
    invalidEmail: 'Enter a valid email address.',
    passwordRequired: 'Password is required.',
    genericError: 'Unable to sign in. Check your credentials and try again.',
    loadingSession: 'Loading session…',
  },
  operator: {
    switcherLabel: 'Operator',
    noOperators: 'No operators available for this account.',
    switchTo: 'Switch operator',
    loading: 'Loading operators…',
  },
  nav: {
    sectionMain: 'Workspace',
    dashboard: 'Dashboard',
    bookings: 'Bookings',
    calendar: 'Calendar',
  },
  theme: {
    switchToDark: 'Switch to dark theme',
    switchToLight: 'Switch to light theme',
  },
  userMenu: {
    label: 'User menu',
  },
  bookings: {
    title: 'Bookings',
    empty: 'No bookings yet.',
    loading: 'Loading bookings…',
    error: 'Failed to load bookings.',
    columnDate: 'Date',
    columnCustomer: 'Customer',
    columnProduct: 'Product',
    columnStatus: 'Status',
    columnPrice: 'Price',
    filterPlaceholder: 'Search bookings…',
    detailsTitle: 'Booking',
    detailsClose: 'Close',
  },
  calendar: {
    title: 'Calendar',
    loading: 'Loading calendar…',
    error: 'Failed to load calendar.',
    empty: 'No bookings scheduled.',
    viewMonth: 'Month',
    viewWeek: 'Week',
    viewDay: 'Day',
    rescheduleError: 'Could not reschedule booking.',
  },
} as const
