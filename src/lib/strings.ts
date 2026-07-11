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
    // landr-fzcg — 3-state sidebar collapse control.
    sidebarMode: {
      groupLabel: 'Sidebar style',
      collapsed: 'Always collapsed',
      expanded: 'Always expanded',
      hoverExpand: 'Peek on hover',
      cycleHint: 'Switch sidebar style',
    },
    settings: 'Settings',
    // landr-v0xg — Views section label (sidebar primary nav).
    views: 'Views',
  },
  // landr-7dya.10 — top-level app-mode switch (single-operator · view-as ·
  // ticket-system). Staff-only; non-staff never see the switcher.
  appMode: {
    switcherLabel: 'Workspace mode',
    menuLabel: 'Workspace',
    // Mode entries.
    operator: 'Operator dashboard',
    operatorHint: 'Your home turf — full operator workspace',
    viewAs: 'View as operator',
    viewAsHint: 'See the dashboard exactly as your customer does',
    tickets: 'Ticket system',
    ticketsHint: 'Full-screen support & feedback hub',
    // Ticket-system shell chrome.
    ticketSystemTitle: 'Ticket system',
    exitToOperator: 'Exit to dashboard',
    exitToOperatorAria: 'Exit the ticket system and return to the operator dashboard',
    // Ticket-system sub-surface tabs.
    surfaceInbox: 'Inbox',
    surfaceBoard: 'Board',
    surfacePlanning: 'Planning',
  },
  // landr-7dya.11 — shell-level combinable ticket filter bar (spans Inbox +
  // Board). Quick chips + a full filter popover, all deep-linkable in the URL.
  ticketFilters: {
    barLabel: 'Ticket filters',
    // Quick chips
    chipAssignedToMe: 'Assigned to me',
    chipUnread: 'Unread',
    chipMentionedMe: 'Mentioned me',
    chipUnassigned: 'Unassigned',
    chipWatching: 'Watching',
    chipBlocked: 'Blocked',
    // More-filters popover
    moreFilters: 'More filters',
    sectionType: 'Type & urgency',
    sectionScope: 'Scope',
    sectionTime: 'Time',
    // Selects (used as the empty-option label + aria-label)
    operatorLabel: 'Operator',
    operatorAll: 'All operators',
    statusLabel: 'Status',
    statusAll: 'Any status',
    typeLabel: 'Type',
    typeAll: 'Any type',
    severityLabel: 'Severity',
    severityAll: 'Any severity',
    priorityLabel: 'Priority',
    priorityAll: 'Any priority',
    moscowLabel: 'MoSCoW',
    moscowAll: 'Any MoSCoW',
    impactLabel: 'Impact',
    impactAll: 'Any impact',
    tierLabel: 'Origin tier',
    tierAll: 'All tiers',
    timeRangeLabel: 'Time range',
    timeRangeAll: 'Any time',
    timeFieldLabel: 'Date field',
    timeFieldCreated: 'Created',
    timeFieldUpdated: 'Updated',
    clearAll: 'Clear all',
  },
  // landr-wmsc — Cmd/Ctrl+K command palette.
  commandPalette: {
    dialogTitle: 'Command palette',
    dialogDescription:
      'Search bookings, contacts, products, and views — or run a quick action.',
    inputPlaceholder: 'Where to? Type a command or search…',
    empty: 'Nothing found. Try a different search.',
    groupNav: 'Navigation',
    groupActions: 'Quick actions',
    groupBookings: 'Bookings',
    groupContacts: 'Contacts',
    groupProducts: 'Products',
    groupViews: 'Views',
    actionNewBooking: 'New booking',
    actionNewView: 'New view',
    actionOpenSettings: 'Open settings',
    bookingMissingCustomer: 'Unknown customer',
  },
  // landr-kwu9 — global ? keyboard shortcuts cheat sheet.
  keyboardShortcuts: {
    dialogTitle: 'Keyboard shortcuts',
    dialogDescription:
      'Navigate at the speed of light. Press ? from anywhere to pull this back up.',
    groupGlobal: 'Global',
    groupNavigation: 'Navigation',
    // landr-euta — j/k/Enter/x row navigation on Bookings, Contacts,
    // Approvals.
    groupLists: 'Lists & tables',
    groupDialogs: 'Dialogs & sheets',
    shortcuts: {
      commandPalette: 'Open command palette',
      keyboardHelp: 'Show this shortcuts sheet',
      toggleSidebar: 'Toggle sidebar',
      closeOverlay: 'Close any open dialog, sheet, or palette',
      sortColumn:
        'Sort a table column (click the header arrow; arrow keys cycle directions)',
      calendarPrevNext:
        'Previous / next period in the calendar (use the toolbar buttons)',
      // landr-euta — row navigation shortcuts. j/k move the cursor;
      // Enter opens the row's detail surface; x toggles bulk-select.
      rowDown: 'Move to next row',
      rowUp: 'Move to previous row',
      rowOpen: 'Open focused row',
      rowToggleSelect: 'Toggle selection of focused row',
    },
  },
  auth: {
    signInHeading: 'Welcome back',
    signInDescription: 'Sign in to your operator dashboard.',
    emailLabel: 'Email',
    emailPlaceholder: 'you@operator.example',
    passwordLabel: 'Password',
    passwordPlaceholder: '••••••••',
    submit: 'Sign in',
    submitting: 'Signing in…',
    signOut: 'Sign out',
    invalidEmail: 'Enter a valid email address.',
    passwordRequired: 'Password is required.',
    genericError: 'Could not sign in. Double-check your credentials and try again.',
    loadingSession: 'Loading your session…',
    sessionExpired: 'Your session expired — please sign in again.',
    continueWith: (provider: string) => `Continue with ${provider}`,
    continueWithLoading: (provider: string) => `Connecting to ${provider}…`,
    continueDivider: 'or',
    emailInUseTitle: 'That email already has an account',
    emailInUseBody:
      'Sign in with your password, then connect Google from Settings → Connected accounts.',
    oauthUnknownError:
      'Sign-in did not complete. Please try again or use your password.',
    // landr — Forgot / reset password flow.
    forgotLink: 'Forgot password?',
    forgotHeading: 'Forgot your password?',
    forgotDescription:
      "No worries — enter your email and we'll send you a link to set a new one.",
    forgotSubmit: 'Send reset link',
    forgotSubmitting: 'Sending…',
    // Neutral, account-enumeration-safe confirmation (shown regardless of
    // whether the address has an account).
    forgotSentTitle: 'Check your inbox',
    forgotSentBody: (email: string) =>
      `If an account exists for ${email}, we've sent a reset link. It expires in one hour.`,
    forgotBackToLogin: 'Back to sign in',
    resetHeading: 'Set a new password',
    resetDescription: 'Pick something strong — you can do it.',
    resetNewPasswordLabel: 'New password',
    resetConfirmLabel: 'Confirm new password',
    resetSubmit: 'Update password',
    resetSubmitting: 'Updating…',
    resetSuccess: "Password updated — you're in!",
    resetMismatch: 'Passwords do not match.',
    resetTooShort: 'Password must be at least 8 characters.',
    resetVerifying: 'Verifying your reset link…',
    resetLinkInvalidTitle: 'This reset link is invalid or has expired',
    resetLinkInvalidBody:
      'Reset links expire after one hour and can only be used once. Grab a fresh one below.',
    resetRequestNew: 'Get a new link',
    resetGenericError: 'Could not update your password. Please try again.',
  },
  // landr — logged-in change-password (Settings → Security). Re-enters the
  // current password (verified via signInWithPassword) before updateUser.
  security: {
    title: 'Security',
    description: 'Keep your account locked down.',
    changePasswordHeading: 'Change password',
    changePasswordDescription:
      "Choose a strong password you don't use anywhere else.",
    currentPasswordLabel: 'Current password',
    newPasswordLabel: 'New password',
    confirmPasswordLabel: 'Confirm new password',
    submit: 'Update password',
    submitting: 'Updating…',
    success: 'Password updated. Nice work.',
    currentRequired: 'Enter your current password.',
    currentIncorrect: 'Current password is incorrect.',
    mismatch: 'New passwords do not match.',
    tooShort: 'Password must be at least 8 characters.',
    sameAsCurrent: 'New password must be different from your current one.',
    genericError: 'Could not update your password. Please try again.',
    // Provider-only operators (e.g. Google sign-in) have no email/password
    // identity yet — they SET a password in-app instead of going through
    // "Forgot password?".
    setPasswordHeading: 'Add a password',
    setPasswordDescription:
      "Add a password so you can sign in with email as well as Google. Make it strong — something only you'd know.",
    setSubmit: 'Set password',
    setSubmitting: 'Setting…',
    setSuccess:
      'Password set! You can now sign in with your email too.',
  },
  connectedAccounts: {
    title: 'Connected accounts',
    description:
      'Link extra sign-in methods to your account. Any linked provider works for sign-in.',
    loading: 'Loading connected accounts…',
    error: 'Failed to load connected accounts.',
    statusLinked: 'Linked',
    statusNotLinked: 'Not linked',
    primaryEmail: 'Email & password',
    primaryEmailDescription: 'Sign in with your email address and password.',
    connect: 'Connect',
    connecting: 'Connecting…',
    disconnect: 'Disconnect',
    disconnecting: 'Disconnecting…',
    disconnectDisabledTooltip: "You can't remove your only sign-in method.",
    confirmDisconnectTitle: 'Disconnect this provider?',
    confirmDisconnectBody: (provider: string) =>
      `You will no longer be able to sign in with ${provider}. You can re-connect later.`,
    confirmDisconnectCancel: 'Keep connected',
    confirmDisconnectAction: 'Disconnect',
    toastLinkError: (provider: string) => `Failed to connect ${provider}.`,
    toastUnlinked: (provider: string) => `${provider} disconnected.`,
    toastUnlinkError: (provider: string) => `Failed to disconnect ${provider}.`,
  },
  operator: {
    switcherLabel: 'Operator',
    noOperators: 'No operators linked to this account.',
    switchTo: 'Switch operator',
    loading: 'Loading operators…',
    // landr-2soj / landr-7dya.13 — staff "View as operator" mode.
    viewAs: {
      // Picker section header inside the operator switcher (staff-only).
      sectionLabel: 'View as operator (staff)',
      // Banner copy. Built at render time (no i18n interpolation lib here):
      // bannerPrefix + <operator> + bannerMiddle + <email> + bannerSuffix.
      bannerPrefix: 'Viewing as ',
      bannerMiddle: ' — you’re still ',
      bannerSuffix: '; actions are attributed to you.',
      exit: 'Exit to staff view',
      // aria-live announcement when exiting view-as (entering is announced by
      // the banner itself mounting as a role="status" region).
      exitedAnnouncement: 'Exited view-as mode; restored full staff view.',
      bannerRegionLabel: 'Staff view-as status',
      // landr-7dya.13 — operator picker dialog (command dialog).
      pickerTitle: 'View as operator',
      pickerDescription: 'Pick an operator to preview their dashboard exactly as they see it.',
      pickerPlaceholder: 'Search operators…',
      pickerGroupLabel: 'Operators',
      pickerLoading: 'Loading operators…',
      pickerEmpty: 'No operators found.',
      pickerActive: 'viewing',
    },
  },
  nav: {
    dashboard: 'Dashboard',
    bookings: 'Bookings',
    calendar: 'Calendar',
    // landr-af6c — Analytics sits between Calendar and Contacts in the
    // primary nav. Keep Reporting as a separate (older) destination so
    // existing operator bookmarks and the CSV export don't move.
    analytics: 'Analytics',
    contacts: 'Contacts',
    reporting: 'Reporting',
    generalApprovals: 'Approvals',
    account: 'Account',
    settings: 'Settings',
    // landr-aref — /audit route (audit_log viewer).
    audit: 'Audit log',
    // landr-4pn1 — /trash route (recently-deleted bin per type).
    trash: 'Trash',
    // landr-wwhn.11 — /tickets kanban board.
    tickets: 'Tickets',
    // landr-wwhn.23 — /tickets/planning release-planning overlay.
    ticketPlanning: 'Release planning',
    // landr-znzz.8 — /retrieve operator retrieve board (day check-ins).
    retrieve: 'Retrieve board',
    // landr-sbhz.8 — /revenue owner platform-commission overview (staff-only).
    revenue: 'Revenue',
    // landr-wwhn.28 — /feedback-inbox cross-operator triage surface (staff-only).
    feedbackInbox: 'Feedback inbox',
    // landr-a99u.6 — /release promotion console (staff-only).
    release: 'Release',
    // landr-a4pl.2 — /invoicing: Holded invoice transfer status + Sync-now.
    invoicing: 'Invoicing',
    // AppSidebar hue-section group headers (rendered above a cluster of
    // primary nav items — see the "Hue sections" render block).
    sections: {
      bookings: 'Bookings',
      people: 'People',
      finance: 'Finance',
      comms: 'Comms',
      admin: 'Admin',
      account: 'Account',
    },
  },
  // landr-aref — /audit route strings (audit_log viewer).
  audit: {
    title: 'Audit log',
    subtitle:
      'Tenant-scoped audit trail of INSERT / UPDATE / DELETE on operator data. Click a row to inspect the full payload.',
    filtersTitle: 'Filters',
    filterAllOption: 'All',
    filterEntityTypeLabel: 'Entity type',
    filterOperationLabel: 'Operation',
    filterActorLabel: 'Actor user ID',
    filterActorPlaceholder: 'auth.users UUID (exact match)',
    filterFromLabel: 'From',
    filterToLabel: 'To',
    filterResetLabel: 'Reset filters',
    columnOccurredAt: 'Occurred at',
    columnEntityType: 'Entity',
    columnOperation: 'Op',
    columnActor: 'Actor',
    columnRowId: 'Row ID',
    loading: 'Loading audit log…',
    error: 'Failed to load audit log.',
    empty: 'No audit entries match the current filters.',
    prevPage: 'Previous',
    nextPage: 'Next',
    pageLabel: (page: number, count: number) =>
      `Page ${page} · ${count} ${count === 1 ? 'entry' : 'entries'}`,
    drawerTitle: 'Audit entry',
    drawerRowId: 'Row ID',
    drawerActor: 'Actor',
    drawerCorrelation: 'External correlation',
    drawerOperator: 'Operator',
    drawerPayload: 'Payload (old_row + new_row)',
  },
  // landr-znzz.8 — /retrieve operator retrieve board strings.
  retrieve: {
    title: 'Retrieve board',
    subtitle:
      "Who's down, who's still out, and where pickups are needed — at a glance.",
    dayLabel: 'Day',
    loading: 'Loading the board…',
    error: 'Failed to load the retrieve board.',
    empty: 'No check-ins recorded for this day yet.',
    overdueHint: 'Not yet checked in — keep an eye out.',
    noteLabel: 'Note',
    mapLink: 'Open map',
    retrieveStateLabel: 'Retrieve',
    retrieveNoteLabel: 'Retrieve note',
    retrieveNotePlaceholder: "e.g. Tom's on his way, 20 min",
    saveRetrieveNote: 'Save note',
    toastSaved: 'Retrieve status updated.',
    toastError: 'Could not update the retrieve status.',
    countLabel: (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`,
  },
  // landr-4pn1 — /trash route strings (recently-deleted bin).
  trash: {
    title: 'Recently deleted',
    subtitle:
      'Soft-deleted items, sorted by category. Restore brings anything back; the bin clears itself over time.',
    loading: 'Loading…',
    error: 'Failed to load this category.',
    empty: 'Nothing in the bin here.',
    columnItem: 'Item',
    columnDeletedAt: 'Deleted',
    restore: 'Restore',
    restoring: 'Restoring…',
    restoreSuccess: 'Restored.',
    restoreError: 'Restore failed. Try again.',
    tabs: {
      bookings: 'Bookings',
      contacts: 'Contacts',
      products: 'Products',
      operator_tags: 'Tags',
      pricing_schemes: 'Pricing schemes',
    },
  },
  // landr-fzcg — sibling of settingsHub for the Account sub-sidebar.
  accountHub: {
    navLabel: 'Account sections',
  },
  settingsHub: {
    navLabel: 'Settings sections',
    sections: {
      company: 'Company',
      calendarDisplay: 'Calendar & display',
      displayPreferences: 'Display preferences',
      team: 'Team',
      // landr-funh — operational delivery roster (instructors, pilots,
      // drivers). Distinct from Team (operator_memberships / dashboard
      // sign-in). landr-genericity-northstar.
      providers: 'Providers',
      pickupLocations: 'Pickup locations',
      // landr-cyoi — Hotels as a first-class settings entity (separate from
      // generic pickup locations; carry address/email/phone/maps_link).
      hotels: 'Hotels',
      products: 'Products',
      // landr-up1b — nested product categories (the operator-owned
      // product_groups tree). Sits right after Products in the IA.
      categories: 'Categories',
      // landr-up1b — booking-widget embed/shortcode generator.
      // landr-ylvp — renamed Embed widget → Embed code (how you install it).
      embed: 'Embed code',
      // landr-znzz.5 — generic per-operator offers/upsells shown in the
      // AFTER phase of the customer event page.
      offers: 'Upsells & offers',
      // landr-e8jf — Schedule moved from main sidebar into Settings
      // (capacity pills now on Calendar; Schedule is a setup tool).
      schedule: 'Schedule',
      emailTemplates: 'Email templates',
      // landr-qg4q — outbound_emails viewer (failed sends, retried, sent).
      emailLog: 'Email log',
      integrationsGmail: 'Gmail',
      // landr-resend-sender — per-operator Resend sending domain. Sends
      // booking emails from the operator's own domain (replaces the Gmail
      // OAuth integration).
      emailSender: 'Email sending',
      // landr-6ybs — per-operator subscribable ICS calendar feed.
      integrationsCalendar: 'Calendar feed',
      // landr-1nwu.2 — per-operator Stripe + Holded credentials.
      integrationsPayments: 'Payments & invoicing',
      connectedAccounts: 'Connected accounts',
      security: 'Security',
      plan: 'Plan',
      pricing: 'Pricing',
      // landr-9n0l — commission schemes (platform/agent/provider) + the
      // read-only agent-earnings report.
      commissions: 'Commissions',
      // landr-yp8x — operator branding shown in the embedded booking widget.
      // landr-ylvp — renamed Branding → Brand (who you are: logo + colours).
      branding: 'Brand',
      // landr-jb1k — booking-widget presentation: showcased layout variant,
      // category grid columns, and title typography.
      // landr-ylvp — now also owns the booking-widget text card (what
      // customers see), moved here from Brand.
      widget: 'Booking widget',
      // landr-znzz.7 — optional weather forecast hint for the conditions verdict.
      weather: 'Weather',
      // landr-iz58 — operator-scoped tags applied to bookings + contacts.
      tags: 'Tags',
      // landr-1tqx — operator-scoped participant service roles
      // (Pilot/Passenger/Diver…) read by the booking widget.
      serviceRoles: 'Service roles',
      // landr-sp4r — operator-scoped marketing campaigns for booking
      // attribution (bookings.campaign_id).
      campaigns: 'Campaigns',
      // landr-v198 — operator-scoped voucher / promo-code editor.
      vouchers: 'Vouchers',
      // landr-r87i — default per-booking checklist items the operator
      // customises (v2 of landr-84n1; defaults move from hardcoded to
      // operator_checklist_templates).
      operations: 'Operations',
      // landr-ah9u — operator webhook configuration (v1 localStorage,
      // v2 server-delivered via background worker).
      webhooks: 'Webhooks',
      // landr-atwy — per-operator opt-in for the post-booking account-link prompt.
      accountLink: 'Account link prompt',
      // landr-c53m.14 — per-operator toggle for declarations enforcement
      // at booking-submit time.
      declarations: 'Declarations',
      // landr-wwhn.16 — personal notification preferences (bell/email/push
      // + per-ticket overrides). Personal scope, not operator scope.
      notifications: 'Notifications',
      // landr-sbhz.5 — STAFF-ONLY tier/feature editor. Hidden from non-staff
      // in the sub-sidebar; this is Landr platform tooling, not operator scope.
      tiers: 'Tiers & features',
      // landr-71kz.5 — operator form library (custom booking forms).
      forms: 'Forms',
    },
    // landr-fnhz — one-line description for each settings subsection,
    // rendered as the PageTitle subtitle on the matching sub-page so the
    // topbar gives operators at-a-glance context about what the section
    // controls.
    sectionDescriptions: {
      company: 'Legal entity, tax ID, and contact details for invoices.',
      calendarDisplay: 'Set your working hours and preferred time format.',
      displayPreferences: 'Toggle dashboard hints and upgrade prompts.',
      team: 'Add and remove staff members.',
      providers:
        'The people who deliver your service — instructors, pilots, drivers. Assign them to booking days.',
      pickupLocations: 'Manage pickup sites and meeting points.',
      // landr-cyoi — Hotels settings section subtitle.
      hotels: 'Manage accommodation partners and their contact details.',
      products: 'Configure bookable products and availability rules.',
      categories:
        'Organise products into a nested category tree — rename, reorder, and reparent with ease.',
      // landr-ylvp — Embed code: how you install the widget.
      embed:
        'Generate the [landr_booking] shortcode or iframe to drop your booking widget onto any website.',
      offers:
        'Post-trip add-ons on the customer event page. Each card links out to your shop, merch store, or form.',
      schedule: 'Plan availability windows and one-off closures.',
      emailTemplates:
        'Customise the transactional emails customers receive at each booking milestone.',
      // landr-qg4q — read-only audit surface for the outbound_emails queue.
      emailLog:
        'Outbound email history: see what was sent, what failed, and why.',
      integrationsGmail:
        'Send booking emails from your own Gmail address via OAuth.',
      // landr-resend-sender — per-operator Resend sending domain.
      emailSender:
        'Send booking emails from your own domain. Add a few DNS records and we verify it with Resend.',
      // landr-6ybs — per-operator subscribable ICS calendar feed.
      integrationsCalendar:
        'Subscribe to a live ICS feed of all your bookings in Google, Apple, or Outlook Calendar.',
      // landr-1nwu.2 — per-operator Stripe + Holded credentials (test/live).
      integrationsPayments:
        'Add your Stripe and Holded API keys. Secrets are encrypted and never shown again.',
      connectedAccounts:
        'Sign-in methods linked to your account (Google, Apple, GitHub).',
      security: 'Update your account password.',
      plan: 'Your current subscription plan.',
      pricing: 'Discounts, surcharges, and pricing modifiers.',
      // landr-9n0l — commission scheme editor + agent-earnings report.
      commissions:
        'Commission schemes for agents, providers, and the platform — plus per-agent earnings.',
      // landr-ylvp — Brand: who you are (logo + colours only). Widget text
      // moved to the Booking widget section.
      branding: 'Your logo and brand colours (3 slots + dark mode) in the booking widget.',
      // landr-jb1k — booking-widget layout/density/title style.
      // landr-ylvp — also owns the widget text (headline/description/footer).
      widget:
        'Pick the widget layout, grid columns, title style, and the headline, description, and footer customers see.',
      // landr-znzz.7 — optional weather forecast hint for the conditions verdict.
      weather:
        'Show a one-line weather forecast hint when you set daily conditions updates.',
      tags: 'Colour-coded labels to tag bookings and contacts.',
      // landr-1tqx — participant service-role catalogue read by the widget.
      serviceRoles:
        'The participant roles customers choose on the booking form (Pilot, Passenger, Diver…).',
      // landr-sp4r — marketing campaigns for booking attribution.
      campaigns:
        'Marketing campaigns and codes — attribute bookings back to the channel that brought them in.',
      // landr-v198 — promo-code editor.
      vouchers:
        'Discount codes customers redeem at checkout.',
      // landr-r87i — default per-booking checklist editor.
      operations:
        'Default checklist items seeded into every new booking. Per-booking progress stays on-device.',
      // landr-ah9u — operator webhook configuration.
      webhooks:
        'Subscribe an HTTPS endpoint to booking and payment events. Config is saved locally; server delivery ships in v2.',
      // landr-atwy — post-booking account-link prompt opt-in.
      accountLink:
        'Show (or hide) the post-booking prompt inviting customers to track their trip in the LANDR app.',
      // landr-c53m.14 — declarations enforcement at booking-submit time.
      declarations:
        'Require customers to accept declarations before booking.',
      // landr-wwhn.16 — personal notification preferences.
      notifications:
        'Choose how you hear about ticket activity — bell, email, or mobile push.',
      // landr-sbhz.5 — staff-only tier/feature entitlement editor.
      tiers:
        'Landr staff: enable features per subscription tier, or override individual operators one feature at a time.',
      // landr-71kz.5 — operator form library.
      forms:
        'Reusable booking forms with fields, validation, and conditional logic. Attach them to products in the Flow tab.',
    },
    plan: {
      title: 'Plan',
      description: 'Your current subscription plan.',
      currentLabel: 'Current plan',
      slugLabel: 'Plan slug',
      noPlan: 'No plan information on file.',
      upgradeHint:
        'Plan upgrades are coming in a future release. Reach out to support if you need to change your plan now.',
    },
  },
  // landr-sbhz.5 — STAFF-ONLY tier/feature editor (Settings → Tiers & features).
  tierEditor: {
    title: 'Tiers & features',
    subtitle:
      'Landr staff control surface for feature entitlements. Set what each subscription tier includes, and override individual operators one feature at a time.',
    loading: 'Loading…',
    errorTitle: 'Failed to load features',
    noFeatures: 'No features in the registry.',
    saveFailed: 'Save failed',
    // Tier panel
    tierSectionTitle: 'Tier defaults',
    tierSectionHint:
      'Toggle which features a subscription tier includes by default. Per-operator overrides below take precedence over these.',
    tierPickerLabel: 'Tier',
    tierSaved: 'Tier feature updated.',
    inactiveSuffix: '(inactive)',
    defaultBadge: 'default',
    // Operator override panel
    overrideSectionTitle: 'Per-operator override',
    overrideSectionHint:
      'Force a single feature on or off for one operator, regardless of their tier — the incremental-unlock lever. The effective column shows what the operator actually gets (override > tier > default).',
    operatorPickerLabel: 'Operator',
    operatorPickerPlaceholder: 'Select an operator…',
    overrideEmpty: 'Select an operator to manage their feature overrides.',
    noteLabel: 'Override note (optional)',
    notePlaceholder: 'e.g. Unlocking manifest for Para42 contract pilot.',
    noteHint:
      'Saved with the next override you set, for the audit trail. Clear it before setting an override you do not want annotated.',
    notePrefix: 'Note:',
    forceOn: 'On',
    forceOff: 'Off',
    clearOverride: 'Clear',
    overrideSaved: 'Operator override updated.',
    overrideCleared: 'Override cleared — reverted to tier default.',
    effectiveOn: 'effective: on',
    effectiveOff: 'effective: off',
    effectiveTooltip:
      'Effective entitlement after resolving override > tier > registry default.',
    // v2 additions (landr-72u2.2)
    catalogSectionTitle: 'Feature catalog',
    catalogSectionHint:
      'All features in the Landr registry — descriptions, surfaces, and status. Read-only reference.',
    catalogSearchPlaceholder: 'Search features…',
    catalogRetiredLabel: 'Retired features',
    catalogParamChip: 'parametric',
    matrixSectionTitle: 'Tier matrix',
    matrixSectionHint:
      'Toggle which features each subscription tier includes. For parametric features, set tier-level param values.',
    paramChipLabel: 'params',
    paramPopoverTitle: 'Tier param values',
    paramPopoverSaveLabel: 'Save params',
    paramPopoverClearLabel: 'Inherit default',
    paramPopoverOperatorClearLabel: 'Inherit tier',
    operatorParamChipLabel: 'params',
    operatorParamPopoverTitle: 'Operator param override',
    effectiveConfigLabel: 'effective config:',
  },
  // landr-resend-sender — Account → Email sending (per-operator Resend
  // sending domain). Send booking emails from the operator's own domain.
  emailSenderSettings: {
    title: 'Email sending',
    loading: 'Loading…',
    errorTitle: 'Failed to load email sending settings',

    // --- Unconfigured: explainer + setup form ---
    introTitle: 'Send from your own domain',
    introBody:
      'Booking emails currently send from a Landr address. Connect your own domain so confirmations, reminders, and updates arrive from you — better deliverability and a more professional look.',
    domainLabel: 'Sending domain',
    domainHint: 'The root domain you own, e.g. example.com — not a full email address.',
    domainPlaceholder: 'example.com',
    localPartLabel: 'From address (optional)',
    localPartHint: 'The part before the @. Defaults to “bookings”.',
    localPartPlaceholder: 'bookings',
    previewLabel: 'Emails will send from',
    previewPending: 'Enter a domain to preview your From address.',
    checkDomainButton: 'Check domain',
    checkDomainChecking: 'Checking…',
    checkDomainHintAuto:
      'Good news — your domain is already hosted with us, so we’ll set up email automatically. No DNS changes on your side. ✨',
    checkDomainHintManual:
      'You’ll add a few DNS records at your provider — we’ll show them after you continue.',
    setupButton: 'Set up',
    setupSubmitting: 'Setting up…',
    setupSuccess: 'Sending domain set up — we’re verifying it now. ✨',
    setupVerified: 'Sending domain set up and verified. ✅',
    setupError: 'Could not set up sending domain',
    domainRequired: 'Enter the domain you want to send from.',
    domainInvalid: 'That doesn’t look like a domain. Use something like example.com.',

    // --- After setup: DNS records ---
    autodnsTitle: 'Hosted with us — records added automatically ✨',
    autodnsBody:
      'Because your domain is hosted with us, we added your DKIM records for you — no DNS changes needed on your side. A perk of being a customer! Verification usually completes within a few minutes.',
    manualTitle: 'Add these DNS records',
    manualBody:
      'Add the records below to your domain’s DNS, then click Verify. Changes can take a few minutes to propagate.',
    manualSteps: [
      'Log in to your domain’s DNS provider (e.g. Cloudflare, GoDaddy, Namecheap).',
      'For each row below, add a new DNS record with the given Type, Name, and Value.',
      'Save your changes, then click Verify below — propagation can take a few minutes.',
    ] as string[],
    dnsColType: 'Type',
    dnsColName: 'Name',
    dnsColValue: 'Value',
    copyValue: 'Copy value',
    copyRow: 'Copy full row',
    copied: 'Copied to clipboard',
    copyFailed: 'Could not copy — copy it manually',
    verifyButton: 'Verify',
    recheckButton: 'Re-check',
    verifying: 'Verifying…',
    verifyError: 'Verification failed',
    verifySuccess: 'Domain verified — you can now send email. ✅',
    verifyPending:
      'Still verifying — DNS can take a few minutes to propagate. We’ll keep checking automatically.',

    // --- Configured: status + active From ---
    statusVerified: 'Verified',
    statusPending: 'Verifying',
    statusFailed: 'Verification failed',
    statusUnverified: 'Not verified',
    activeFromLabel: 'Sending from',
    fallbackNotice:
      'Until your domain is verified, emails still send from the Landr fallback address.',
    lastErrorLabel: 'Last error',
    changeDomainButton: 'Change domain',
    changeDomainCancel: 'Cancel',
    reverifyButton: 'Re-verify',

    // --- Test email card (landr-gp0v) — visible only when domain is verified ---
    testEmailTitle: 'Send a test email',
    testEmailDescription:
      'Send a test message from your verified sending domain to confirm delivery is working.',
    testEmailLabel: 'Recipient address',
    testEmailPlaceholder: 'you@example.com',
    testEmailButton: 'Send test',
    testEmailSending: 'Sending…',
    testEmailSuccessPrefix: 'Sent:',
    testEmailFailedPrefix: 'Failed:',
    testEmailMessageId: 'Message ID:',
  },
  // landr-sbhz.8 — /revenue: owner platform-commission overview (STAFF-ONLY).
  revenue: {
    title: 'Revenue',
    subtitle:
      'Platform commission Landr earns from each operator — a percentage of net booking revenue per the operator contract (5% in 2026, 4% from 2027). Realized = finalised bookings; projected = confirmed/pending bookings not yet finalised.',
    loading: 'Loading revenue…',
    errorTitle: 'Failed to load revenue',
    empty: 'No operators with platform commission yet.',
    // Totals cards
    realizedLabel: 'Realized',
    realizedHint: 'Commission on finalised bookings (net of reversals).',
    projectedLabel: 'Projected',
    projectedHint: 'Commission on confirmed / pending bookings not yet finalised.',
    totalLabel: 'Total payable',
    totalHint: 'Realized + projected platform commission Olaf earns.',
    // Per-operator section
    noPlatformScheme: 'No platform commission scheme',
    // Year table columns
    columnYear: 'Year',
    columnRate: 'Rate',
    columnNetBase: 'Net revenue',
    columnRealized: 'Realized',
    columnProjected: 'Projected',
    columnTotal: 'Total',
    columnBookings: 'Bookings',
    operatorTotalRow: 'Total',
    generatedAt: (iso: string) => `As of ${new Date(iso).toLocaleString('de-DE')}`,
  },
  // landr-a4pl.2 — /invoicing: Holded invoice transfer status + manual Sync-now.
  invoicing: {
    title: 'Invoicing',
    subtitle:
      'Holded invoice transfer status for finalised bookings. Sync due invoices manually and retry any that failed.',
    errorTitle: 'Failed to load invoices',
    empty: 'No invoices to show in this bucket.',
    // Bucket tab labels (badges show the summary count).
    bucketTransferred: 'Transferred',
    bucketPending: 'Pending',
    bucketFailed: 'Failed',
    bucketBlocked: 'Blocked',
    // Pending sub-flags (by age_days).
    flagDueSoon: 'Due soon',
    flagOverdue: 'Overdue',
    // Table columns.
    columnBookingRef: 'Booking',
    columnCustomer: 'Customer',
    columnFinalised: 'Finalised',
    columnAmount: 'Amount',
    columnStatus: 'Status',
    columnAttempts: 'Attempts',
    columnError: 'Last error',
    columnActions: '',
    attempts: (n: number, max: number) => `${n}/${max}`,
    // Status badge labels (raw status → human).
    statusPending: 'Pending',
    statusInFlight: 'In flight',
    statusSucceeded: 'Transferred',
    statusFailed: 'Failed',
    statusBlocked: 'Blocked',
    // Sync button + outcomes.
    syncButton: 'Sync due invoices to Holded',
    syncing: 'Syncing…',
    retry: 'Retry',
    retryAria: (ref: string) => `Retry Holded sync for booking ${ref}`,
    openBookingAria: (ref: string) => `Open booking ${ref}`,
    // Result toast: "3 transferred, 1 failed, 2 still pending".
    syncResult: (
      succeeded: number,
      failed: number,
      remainingPending: number,
    ) =>
      `${succeeded} transferred, ${failed} failed, ${remainingPending} still pending`,
    syncError: 'Sync failed',
    // Holded-not-connected state.
    notConnectedTitle: 'Holded not connected',
    notConnectedHint:
      'Connect this operator’s Holded API key to transfer invoices.',
    connectHolded: 'Connect Holded',
  },
  // landr-wwhn.28 — /feedback-inbox: cross-operator triage INBOX (STAFF-ONLY).
  feedbackInbox: {
    title: 'Feedback inbox',
    subtitle:
      'Triage inbound operator feedback one operator at a time. Left rail shows all operators with their unread and awaiting-reply counts.',
    loading: 'Loading inbox…',
    errorSummary: 'Could not load inbox summary.',
    errorThreads: 'Could not load threads.',
    emptyRail: 'No operators with feedback yet.',
    emptyThreads: 'No threads match the current filters.',
    emptyThreadsNoFilter: 'No feedback threads from this operator yet.',
    // landr-3qkr.6 — mobile single-pane: return from the thread pane to the
    // operator rail (only shown below md).
    backToInbox: 'Inbox',
    // Left-rail operator row
    unreadBadge: (n: number): string => `${n} unread`,
    awaitingBadge: (n: number): string => `${n} awaiting reply`,
    ticketCount: (n: number): string => `${n} ticket${n === 1 ? '' : 's'}`,
    // Filter bar
    filterUnread: 'Unread',
    filterAwaiting: 'Awaiting reply',
    filterStatusLabel: 'Status',
    filterImpactLabel: 'Impact',
    filterAssigneeLabel: 'Assignee',
    filterClear: 'Clear filters',
    // Timeline event labels
    ticketOpenedLabel: 'Opened ticket',
    internalNoteLabel: 'Internal note',
    staffLabel: 'Staff',
    operatorLabel: 'Operator',
    // Thread header
    viewOnBoardLink: 'View on board',
    noSubject: '(No subject)',
  },
  // landr-a99u.6 — /release: dashboard-driven, role-gated promotion console
  // (dev → staging → main). STAFF-ONLY. Action buttons gate on the server's
  // `viewer` capability block, not raw roles.
  release: {
    title: 'Release promotion',
    subtitle:
      'Promote code through the deploy pipeline: dev → staging (one click) then staging → main (propose → approve). Each promotion merges the pinned head SHA per repo and pushes — the push triggers each repo’s deploy.',
    loading: 'Loading release status…',
    errorTitle: 'Failed to load release status',
    refresh: 'Refresh',
    // Environment matrix
    matrixTitle: 'Environment matrix',
    matrixSubtitle:
      'Commits each branch is ahead of the next, per repo — with the source branch’s head commit and links to GitHub.',
    columnRepo: 'Repo',
    columnDevToStaging: 'dev → staging',
    columnStagingToMain: 'staging → main',
    upToDate: 'up to date',
    commitsAhead: (n: number) => `${n} commit${n === 1 ? '' : 's'}`,
    matrixEmpty: 'No deployable repos reported.',
    // landr local-worktree — DEV/Trillian-only column: uncommitted/unpushed work
    // that hasn't reached GitHub yet (so the GitHub-tip matrix can't see it).
    columnLocal: 'Local (Trillian)',
    localClean: 'clean',
    localUncommitted: (n: number) => `${n} uncommitted`,
    localUnpushed: (n: number) => `${n} unpushed`,
    localBehind: (n: number) => `${n} behind`,
    localError: (reason: string) => `unavailable (${reason})`,
    localStaleTitle:
      'Ahead/behind read from local refs without a fetch — may be stale.',
    // Optional commit-metadata decoration (head commit + GitHub links)
    compareTitle: 'View the ahead range on GitHub',
    historyLink: 'history',
    // Promote to staging
    stagingTitle: 'Promote to staging',
    stagingSubtitle:
      'Merge dev into staging across every repo that has changes. No approval required.',
    stagingButton: 'Promote dev → staging',
    stagingNothing: 'Staging is up to date with dev.',
    stagingNoPermission: 'You do not have permission to promote to staging.',
    stagingNotesLabel: 'Notes (optional)',
    stagingNotesPlaceholder: 'e.g. promoting the booking-widget fix',
    stagingConfirmTitle: 'Promote dev → staging?',
    stagingConfirmDescription:
      'The following repos will be merged from dev into staging and pushed. The push triggers each repo’s staging deploy.',
    stagingConfirmAction: 'Promote',
    stagingToast: 'Staging promotion queued.',
    // Propose to production
    prodTitle: 'Promote to production',
    prodSubtitle:
      'Propose merging staging into main. An approver gives the final go; you cannot ship to production unilaterally.',
    proposeButton: 'Propose to production',
    prodNothing: 'Production is up to date with staging.',
    proposeNotesLabel: 'Proposal notes (required)',
    proposeNotesPlaceholder: 'What was validated on staging? Why ship now?',
    proposeConfirmTitle: 'Propose staging → main?',
    proposeConfirmDescription:
      'The following repos and SHAs are pinned to this proposal. An approver reviews and gives the final go.',
    proposeConfirmAction: 'Propose',
    proposeToast: 'Production promotion proposed — approvers notified.',
    proposeNotesRequired: 'Proposal notes are required.',
    // Pending proposals
    pendingTitle: 'Pending production proposals',
    pendingEmpty: 'No proposals awaiting a decision.',
    proposedBy: (who: string, when: string) =>
      `Proposed by ${who} · ${new Date(when).toLocaleString('en-US')}`,
    approveButton: 'Approve & promote',
    rejectButton: 'Reject',
    cancelButton: 'Cancel proposal',
    approveNotesLabel: 'Approval notes (optional)',
    approveNotesPlaceholder: 'e.g. validated checkout + calendar on staging',
    rejectNotesLabel: 'Rejection reason (required)',
    rejectNotesPlaceholder: 'Why is this proposal being rejected?',
    rejectNotesRequired: 'A rejection reason is required.',
    approveConfirmTitle: 'Approve & promote to production?',
    approveConfirmDescription:
      'This queues the staging → main merge for the pinned SHAs and triggers the production deploy.',
    approveConfirmAction: 'Approve & promote',
    rejectConfirmTitle: 'Reject this proposal?',
    rejectConfirmAction: 'Reject',
    cancelConfirmTitle: 'Cancel your proposal?',
    cancelConfirmDescription:
      'This withdraws the proposal. It will not be promoted.',
    cancelConfirmAction: 'Cancel proposal',
    approveToast: 'Production promotion approved & queued.',
    rejectToast: 'Proposal rejected.',
    cancelToast: 'Proposal cancelled.',
    // History
    historyTitle: 'History',
    historyEmpty: 'No promotion runs yet.',
    historySubtitle: 'Recent promotion runs and their per-repo merge results.',
    notesLabel: 'Notes',
    decisionNotesLabel: 'Decision',
    decidedBy: (who: string, when: string) =>
      `Decided by ${who} · ${new Date(when).toLocaleString('en-US')}`,
    // landr-agiw — run timing line. `elapsed` is preformatted (e.g. "1m 12s").
    runTiming: (start: string, end: string | null, elapsed: string | null) =>
      end
        ? `Started ${new Date(start).toLocaleString('en-US')} · ended ${new Date(end).toLocaleString('en-US')} (${elapsed})`
        : `Started ${new Date(start).toLocaleString('en-US')} · running…`,
    // landr-agiw — migration waterfall (boot-log style step list).
    migrationsApplyingTitle: 'Applying migrations…',
    // landr-agiw — migration_status defaults to 'pending' the moment a run row is
    // created, but the executor only applies migrations once a run is queued
    // (post-approval for staging→main). So a proposed/approved/queued run has NOT
    // applied anything — show this static line, never the "Applying…" spinner.
    migrationsAwaiting:
      'Migrations run when this promotion executes — nothing has been applied yet.',
    migrationsAppliedTitle: (n: number) =>
      `Applied ${n} migration${n === 1 ? '' : 's'}`,
    migrationsFailedTitle: 'Migrations failed',
    migrationsAppliedBeforeFailure: (n: number) =>
      `Applied ${n} before the failure:`,
    migrationsViewLog: 'View log',
    migrationsNoLog: 'No log captured.',
    keep: 'Keep',
    // Status badge labels
    statusProposed: 'Proposed',
    statusApproved: 'Approved',
    statusQueued: 'Queued',
    statusExecuting: 'Executing',
    statusCompleted: 'Completed',
    statusFailed: 'Failed',
    statusRejected: 'Rejected',
    statusCancelled: 'Cancelled',
    // Per-repo merge status labels
    mergePending: 'pending',
    mergeMerged: 'merged',
    mergeNoop: 'no-op',
    mergeConflict: 'conflict',
    mergeError: 'error',
    // landr-a99u.11 — graceful no-token state
    notConfiguredTitle: 'Release promotion not configured',
    notConfiguredDescription:
      'Release promotion isn’t configured yet. Set up the GitHub promotion token to enable this console.',
    // landr-a99u.12 — staff view: customer signoff badge on pending proposals
    signoffByCustomer: (label: string) => `Requested by ${label}`,
    signoffByStaff: 'Proposed by staff',
    // landr-7dya.21 — tier-aware /release. The console re-shapes per deploy
    // tier + viewer role so a wrong-tier action is impossible to surface:
    // dev → only "Promote to staging"; staging → customer (Martin) sees
    // "Request go-live", staff approver sees pending requests + "Approve &
    // promote"; prod → no actions at all. NEVER dev→main, anywhere.
    tierAware: {
      // Cross-tier jump links (TierJumpLinks in Release.tsx). Render up to two
      // anchor buttons in the /release header — one per OTHER tier — so a
      // staff promoter can hop between dev / staging / main consoles with one
      // click. Opens in a new tab so the current session stays anchored on
      // the tier the user is acting from.
      jumpToTierAria: (label: string) => `Open ${label} dashboard /release in a new tab`,
      jumpToTierDev: 'Open in DEV',
      jumpToTierStaging: 'Open in STAGING',
      jumpToTierProd: 'Open in PROD',
      // Unknown-tier fallback — the build was deployed without
      // VITE_DEPLOY_TIER and the server didn't report viewer.tier either.
      // Render a read-only card; no action is safe in this state.
      unknownTierTitle: 'Deploy tier unknown',
      unknownTierDescription:
        'This build did not report its deploy tier. Promotions are disabled until VITE_DEPLOY_TIER is set or the API reports `viewer.tier`. Reload after the next deploy to retry.',
      // Prod-tier message — promotions don't originate from production.
      prodNoActionsTitle: 'No further promotions from production',
      prodNoActionsDescription:
        'Production is the end of the pipeline. Promotions are initiated from dev (staff) or staging (customer signer + staff approver), never from prod.',
      // Customer "Request go-live" card (staging + is_release_signer).
      requestGoLiveTitle: 'Request go-live',
      requestGoLiveDescription:
        "You're on the staging build. Once you've validated the release here, file a request — a landr staff approver will give the final go and ship it to production.",
      requestGoLiveNotesLabel: 'Notes (optional)',
      requestGoLiveNotesPlaceholder:
        'e.g. checkout + calendar reschedule pass on staging',
      requestGoLiveButton: 'Request go-live',
      requestGoLiveSubmitting: 'Sending…',
      requestSentToast: 'Sent — landr staff will approve and promote.',
      requestAlreadyPendingToast:
        'A go-live request is already pending — staff will get to it shortly.',
      requestErrorTitle: 'Could not send go-live request',
      // State shown to the customer when a prior request is already pending.
      customerRequestPendingLabel:
        'Your go-live request is pending staff approval.',
      // State shown to the customer when they are NOT a signer (defence in
      // depth — eligibility=false already hides the form, but if the user
      // navigates directly this gives a clear message).
      notASignerTitle: 'Go-live requests are gated to release signers',
      notASignerDescription:
        'Only designated customer release signers can request a go-live. Talk to landr staff if you need this access.',
      // Eligibility loading placeholder.
      eligibilityLoading: 'Checking your go-live permissions…',
    },
  },
  theme: {
    switchToDark: 'Switch to dark theme',
    switchToLight: 'Switch to light theme',
  },
  userMenu: {
    label: 'User menu',
  },
  // landr-wwhn.15 — topbar notifications bell. v2 replaces the v1 booking-only
  // bell with the ticket-system notifications feed (the reliable source of truth
  // per the EPIC design §Notifications). Backed by the `notifications` table;
  // realtime via postgres_changes; read-state via read_at (web↔mobile in sync).
  notifications: {
    open: 'Open notifications',
    badge: (n: number): string => `${n} unread notifications`,
    heading: 'Notifications',
    empty: "You're all caught up — nothing new.",
    markAllRead: 'Mark all as read',
    loadError: 'Could not load notifications.',
  },
  // landr-wwhn.12 / landr-wwhn.29 — persistent report/suggest entry point + create-ticket form.
  reportButton: {
    // Topbar trigger (persistent, visible on every protected route).
    triggerLabel: 'Report an issue or send feedback',
    triggerText: 'Feedback',
    // Dialog.
    dialogTitle: 'Got something to say?',
    dialogDescription:
      'We read everything and reply right here in the dashboard.',
    // Impact picker (replaces the old type toggle — the single classifier).
    impactLabel: "How's it hitting you?",
    impactBlocking: "Blocking — I can't get work done",
    impactAnnoying: 'Annoying — it slows me down',
    impactIdea: 'Idea / suggestion',
    // Contextual hints shown below the body textarea.
    reproHintBlocking: 'What happened, what did you expect, and what were you trying to do?',
    reproHintAnnoying: "What's the friction — what did you expect to happen instead?",
    // Fields.
    titleLabel: 'Summary',
    titlePlaceholder: 'One-line summary',
    bodyLabel: 'Details',
    bodyPlaceholder: 'More context, steps to reproduce, or background — the more the better.',
    // Attachment zone.
    attachLabel: 'Attach a file or screenshot',
    attachHint: 'Paste (Ctrl+V) or click to attach',
    attachUploading: 'Uploading…',
    // Optional URL field.
    linkLabel: 'Related link',
    linkPlaceholder: 'https://…',
    // Buttons.
    submit: 'Send feedback',
    submitting: 'Sending…',
    cancel: 'Cancel',
    // Success / error toasts.
    toastSuccess: (ticketId: string): string =>
      `Got it — thanks! Ticket #${ticketId.slice(0, 8)} filed.`,
    toastError: "Couldn't send feedback. Try again.",
    // Validation.
    titleRequired: 'A one-line summary is required.',
    linkInvalid: 'Enter a valid URL (starting with https://).',
  },
  // landr-wwhn.13 — ticket detail sheet.
  ticketDetail: {
    sheetTitle: 'Ticket details',
    sheetDescription: (id: string): string => `#${id.slice(0, 8)}`,
    tabDetails: 'Details',
    tabComments: 'Comments',
    tabTimeline: 'Timeline',
    tabAttachments: 'Attachments',
    // landr-wwhn.32 — header who-to-contact
    headerOperatorLabel: 'Org',
    headerReporterLabel: 'Reporter',
    headerOperatorUnknown: 'Unknown org',
    headerReporterUnknown: 'Unknown reporter',
    // Fields
    sectionStatus: 'Status',
    sectionType: 'Type',
    sectionImpact: 'Impact',
    sectionPriority: 'Priority',
    sectionBody: 'Description',
    noBody: 'No description provided.',
    createdAt: 'Opened',
    // Staff-only fields
    sectionInternal: 'Internal (staff only)',
    severityLabel: 'Severity',
    linkedBdLabel: 'bd issue',
    syncStatusLabel: 'Sync status',
    // Watch toggle
    watchLabel: 'Watch',
    watchingLabel: 'Watching',
    watchToastOn: 'Watching this ticket',
    watchToastOff: 'Stopped watching',
    watchToastError: 'Could not update watch status',
    // Comments
    commentPlaceholder: 'Write a comment… (type @ to mention someone)',
    commentInternalPlaceholder: 'Internal note (staff only)…',
    commentSubmit: 'Post',
    commentSubmitting: 'Posting…',
    commentInternalToggle: 'Internal note',
    commentToastError: 'Could not post comment',
    noComments: 'No comments yet.',
    // @mentions (landr-wwhn.24)
    mentionNoResults: 'No matching users.',
    mentionSearching: 'Searching…',
    // Reply-with-CC (landr-7dya.9) — notify extra staff on this reply
    ccLabel: 'CC',
    ccAddLabel: 'CC staff',
    ccPickerPlaceholder: 'Add staff to notify…',
    ccNoStaff: 'No staff available.',
    ccRemove: (email: string): string => `Remove ${email} from CC`,
    ccHint: 'CC’d staff get a bell, push and email for this reply.',
    // Timeline
    noEvents: 'No activity yet.',
    eventCreated: 'Ticket opened',
    eventStatusChanged: (from: string, to: string): string =>
      `Status changed from ${from} to ${to}`,
    eventAssigned: 'Ticket assigned',
    eventUnassigned: 'Ticket unassigned',
    eventBlocked: 'Marked as blocked',
    eventUnblocked: 'Unblocked',
    eventCommentAdded: 'Comment added',
    eventCommentInternal: 'Internal note added',
    eventLabelAdded: 'Label added',
    eventLabelRemoved: 'Label removed',
    eventPromoted: (bdId: string): string => `Sent to development (${bdId})`,
    eventShipped: (ref: string): string => `Shipped (${ref})`,
    eventUnknown: 'Activity',
    // Attachments
    noAttachments: 'No attachments.',
    attachmentUploadLabel: 'Attach file',
    attachmentUploading: 'Uploading…',
    attachmentToastError: (name: string): string =>
      `Could not upload ${name}`,
    attachmentPasteHint: 'You can also paste an image (Ctrl+V / Cmd+V).',
    // Gateway (landr-wwhn.14) — send-to-development, landr-staff only
    gatewaySectionTitle: 'Send to development',
    gatewayPromptLabel: 'Engineering prompt',
    gatewayPromptPlaceholder:
      'Describe what needs to be built — this prompt is sent directly to the bd tracker…',
    gatewaySubmitLabel: 'Send to development',
    gatewaySubmitting: 'Sending…',
    gatewayAlreadyPromoted: (bdId: string): string =>
      `Already in development — bd issue ${bdId}`,
    gatewayToastSuccess: (bdId: string): string =>
      `Sent to development — bd issue ${bdId}`,
    gatewayToastError: 'Could not send to development',
    // Assignee (landr-wwhn.22)
    assigneeSectionTitle: 'Assignee',
    assigneeUnassigned: 'Unassigned',
    assigneePickerPlaceholder: '— Assign to someone —',
    assigneeToastSet: (email: string): string => `Assigned to ${email}`,
    assigneeToastCleared: 'Assignee removed',
    assigneeToastError: 'Could not update assignee',
    assigneeAgentBadge: 'Agent',
    assigneeStaffBadge: 'Staff',
  },
  // landr-wwhn.23 — /tickets/planning MoSCoW release-planning overlay.
  ticketPlanning: {
    pageTitle: 'Release planning',
    pageSubtitle:
      'Tag feature tickets with Must/Should/Could/Won\'t to scope your next release. Changes are landr-staff only.',
    filterAll: 'All types',
    filterFeatures: 'Features only',
    emptyAll: 'No tickets found.',
    emptyUnplanned: 'All tickets have been assigned a MoSCoW tag.',
    clearLabel: "Clear tag",
    saveToast: (title: string, tag: string) => `${title} → ${tag}`,
    clearToast: (title: string) => `Cleared MoSCoW tag for "${title}"`,
    errorToast: 'Failed to update MoSCoW tag.',
    staffOnlyBanner: 'MoSCoW tags are set by landr staff. You can view but not edit them here.',
  },
  // landr-wwhn.16 — Notification preferences settings page + per-ticket
  // override control in the ticket detail sheet.
  notificationPrefs: {
    // Settings page
    pageTitle: 'Notifications',
    globalSectionTitle: 'Default notification settings',
    globalSectionDesc:
      'These settings apply to all new tickets by default. Per-ticket overrides take precedence when set.',
    channelSectionTitle: 'Notification channels',
    bellLabel: 'In-app bell',
    bellDesc: 'Show ticket activity in the notification bell (always available).',
    emailLabel: 'Email',
    emailDesc: 'Receive email echoes of ticket activity.',
    pushLabel: 'Mobile push',
    pushDesc: 'Receive push notifications on your phone (requires the mobile app).',
    deliveryModeLabel: 'Delivery',
    deliveryModeImmediate: 'Immediate',
    deliveryModeDigest: 'Digest (batched)',
    deliveryModeImmediateDesc: 'Deliver each notification as it happens.',
    deliveryModeDigestDesc: 'Batch notifications and deliver periodically.',
    saveAction: 'Save',
    saving: 'Saving…',
    revert: 'Revert',
    toastSaved: 'Notification preferences saved.',
    toastSaveError: 'Could not save notification preferences.',
    noUser: 'Sign in to manage notification preferences.',
    loading: 'Loading preferences…',
    // Per-ticket override (TicketDetailSheet)
    perTicketSectionTitle: 'Notifications for this ticket',
    followingGlobal: 'Following your global default',
    customForTicket: 'Custom for this ticket',
    customHint: 'Overrides your global notification settings for this ticket.',
    followGlobalAction: 'Reset to global default',
    followGlobalDesc: 'Remove the override — this ticket will follow your global default.',
    overrideToastSaved: 'Ticket notification override saved.',
    overrideToastCleared: 'Ticket notification override cleared.',
    overrideToastError: 'Could not save notification override.',
  },
  // landr-a8fg — shared "Copy link" affordance on detail sheets + ViewPage
  // headers. Centralised so the tooltip, success toast and error toast stay
  // consistent across every surface that mounts CopyLinkButton.
  copyLink: {
    tooltip: 'Copy link to this',
    toastSuccess: 'Link copied',
    toastError: 'Could not copy link.',
  },
  bookings: {
    title: 'Bookings',
    // landr-fnhz — topbar subtitle. Shows the current filtered count and
    // gross revenue total so operators see the at-a-glance shape of what
    // they're looking at without scanning the table.
    subtitleSummary: (count: number, revenue: string): string =>
      `${count} ${count === 1 ? 'booking' : 'bookings'} · ${revenue}`,
    empty: 'No bookings here yet.',
    error: 'Failed to load bookings.',
    columnDate: 'Booked on',
    columnServiceDate: 'Service date',
    columnCustomer: 'Customer',
    columnProduct: 'Product',
    columnStatus: 'Status',
    columnPrice: 'Price',
    columnDays: 'Days',
    // landr-iz58 — operator-applied tag chips.
    columnTags: 'Tags',
    filterPlaceholder: 'Search bookings…',
    // landr-xnpc — download the filtered view as CSV.
    exportCsv: 'Download CSV',
    exportCsvAria: (n: number): string =>
      `Download ${n} filtered bookings as CSV`,
    detailsTitle: 'Booking',
    // landr-1lj — filter bar above the table + calendar.
    filters: {
      lifecycleState: 'Status',
      product: 'Product',
      pickupLocation: 'Pickup',
      productKind: 'Kind',
      serviceTimeShape: 'Time shape',
      clearAll: 'Clear filters',
      noOptions: 'No options to filter by yet.',
      activeCount: (n: number): string => ` (${n})`,
      kindLabels: {
        service: 'Service',
        digital_good: 'Digital good',
        physical_good: 'Physical good',
        gift_card: 'Gift card',
      } as Record<string, string>,
      shapeLabels: {
        single_date: 'Single date',
        days_range: 'Days range',
        fixed_window: 'Fixed window',
        time_slot: 'Time slot',
      } as Record<string, string>,
      // Fallback formatter for lifecycle codes the dashboard hasn't given
      // a friendly label to yet. Turns 'awaiting_general_approval' into
      // 'Awaiting general approval' so the chip is still readable.
      stageFallback: (code: string): string =>
        code.charAt(0).toUpperCase() + code.slice(1).replace(/_/g, ' '),
      // landr-knz3 — tooltip shown on a counted filter chip when its
      // count is zero (e.g. an enum value with no bookings yet).
      noOfValue: (label: string): string => `No bookings match ${label}`,
      // landr-qhi0 — view toggle that surfaces bookings whose activity
      // date is already in the past. Default off so the operator focuses
      // on upcoming work.
      showPastLabel: 'Show past bookings',
    },
    // landr-68a9 — pill strip above the Bookings table with hardcoded
    // presets that programmatically set the underlying filter state. The
    // active pill mirrors the current filters; "All" clears every filter.
    quickFilters: {
      ariaLabel: 'Quick filter presets',
      all: 'All',
      today: 'Today',
      thisWeek: 'This week',
      pendingPayment: 'Awaiting payment',
      upcoming: 'Upcoming (next 30d)',
    },
    // landr-oxlk — right-click context menu on a Bookings row. Mark-no-
    // show + Cancel labels deliberately mirror the BookingDetailSheet
    // actions so the operator sees the same wording in both places.
    rowContextMenu: {
      openDetail: 'Open booking',
      copyLink: 'Copy link',
      applyTag: 'Apply tag',
      tagsLoading: 'Loading tags…',
      tagsEmpty: 'No tags yet.',
      tagSelectedMark: '✓',
      markNoShow: 'Mark as no-show',
      cancelBooking: 'Cancel booking',
    },
    // landr-n2j2 — click-to-edit cell labels + toasts.
    inlineEdit: {
      clickToEdit: 'Click to edit',
      statusAria: (current: string): string => `Edit status (currently ${current})`,
      statusUpdateError: 'Could not update status.',
      statusUpdated: 'Status updated.',
      statusUnchangedFromStage: (stage: string): string =>
        `No status change available from "${stage}".`,
      startDateAria: 'Edit start date',
      endDateAria: 'Edit end date',
      datesUpdateError: 'Could not update dates.',
      datesUpdated: 'Dates updated.',
      datesNoItem: 'No scheduled line item to edit.',
      // landr-puix — manual price override on the Bookings table cell.
      priceAria: (current: string): string => `Edit price (currently ${current})`,
      priceUpdated: 'Price override applied.',
      priceUpdateError: 'Could not apply price override.',
      priceNoOperator: 'Select an operator before overriding the price.',
      priceInvalidValue: 'Enter a non-negative number.',
      priceReasonRequired: 'A reason is required for a manual price override.',
      priceOverrideTooltip:
        'Manual override — click "Clear override" in the booking sheet to revert.',
      priceDialogTitle: 'Override booking price',
      priceDialogDescription:
        'Enter the new gross total and a short reason. The override replaces the engine-computed price until you clear it.',
      priceNewAmountLabel: 'New gross total',
      priceReasonLabel: 'Reason',
      priceReasonPlaceholder:
        'e.g. Loyalty discount, voucher comp, hand-shake deal',
      priceDialogConfirm: 'Apply override',
      priceDialogCancel: 'Cancel',
      priceClearAction: 'Clear override',
      priceClearedToast: 'Price override cleared.',
      priceClearError: 'Could not clear price override.',
    },
    // landr-sbhz.2 — Custom Offer composer (per-participant pricing,
    // >N group discount, fair-use commission-free free spots).
    customOffer: {
      title: 'Custom offer',
      description:
        'Set an individual price per participant, an automatic group discount above a headcount, and free (commission-free) spots.',
      action: 'Custom offer',
      linesLabel: 'Participants',
      addLine: 'Add participant',
      removeLine: 'Remove participant',
      linePlaceholder: 'Name / label',
      priceLabel: 'Price',
      freeLabel: 'Free',
      freeHint:
        'Free spots (e.g. a staff companion) are complimentary and commission-free — they never accrue platform commission.',
      thresholdLabel: 'Discount above',
      discountLabel: 'Discount %',
      taxLabel: 'Tax %',
      payingCount: 'Paying participants',
      freeCount: 'Free spots',
      discountApplied: 'Group discount',
      netLabel: 'Net',
      taxTotalLabel: 'Tax',
      grossLabel: 'Gross total',
      commissionFreeHint:
        'Free spots are excluded from the net base used for platform commission.',
      apply: 'Apply offer',
      clear: 'Clear offer',
      cancel: 'Cancel',
      saved: 'Custom offer applied.',
      cleared: 'Custom offer cleared.',
      saveFailed: 'Could not save the custom offer.',
      regularPrice: 'Regular',
      resetToRegular: 'Reset to regular',
      resetAllToRegular: 'Reset all to regular',
      // landr-uvfg.4 — send-offer button
      sendOffer: 'Send offer to customer',
      sendOfferTitle: 'Send offer',
      sendOfferSuccess: (email: string) => `Offer sent to ${email}.`,
      sendOfferFailed: 'Could not send the offer.',
      // landr-c53m.1 fix-forward — operator-defaults fetch failure banner.
      operatorLoadError:
        'Could not load this operator’s tax rate and group discount threshold. Retry, or enter both values yourself before saving.',
      operatorRetry: 'Retry',
      thresholdZeroHint:
        'A threshold of 0 means the group discount applies to any booking once a discount % is set.',
    },
    detail: {
      sectionStatus: 'Status',
      sectionCustomer: 'Customer',
      sectionDates: 'Dates',
      // landr-iz58 — operator-applied tags.
      sectionTags: 'Tags',
      tagsToastError: 'Could not update booking tags.',
      sectionPricing: 'Pricing',
      customerFirstName: 'First name',
      customerLastName: 'Last name',
      customerEmail: 'Email',
      customerPhone: 'Phone',
      dateRangeStart: 'Start date',
      dateRangeEnd: 'End date',
      pickerLabel: 'Pick days',
      pickerHint:
        'Click to pick a date. Click another to make a range. Hold Shift (or Cmd/Ctrl) to toggle individual days.',
      selectedDaysLabel: 'Selected days',
      selectedDaysHint:
        'Click a day chip to toggle it on or off. Pricing recomputes on save.',
      rangeSummary: (range: string) => `Range: ${range}`,
      noSelectedDays: 'No specific days selected for this line item.',
      grossTotalLabel: 'Gross total',
      recomputeHint: 'Recalculated automatically on save.',
      save: 'Save changes',
      saving: 'Saving…',
      cancel: 'Cancel',
      // landr-pztv — explicit print button in the sheet footer. The @media
      // print stylesheet in src/index.css strips chrome and renders only
      // the [data-print-target="booking-detail"] subtree so Ctrl+P or this
      // button produces a clean receipt.
      print: 'Print',
      noChanges: 'Nothing to save yet.',
      saveToastSuccess: 'Booking saved.',
      saveToastError: 'Could not save booking.',
      stageTooltip: (code: string) => `Stage: ${code}`,
      itemHeading: (name: string | null, index: number) =>
        name ? name : `Line item ${index + 1}`,
    },
    cancel: {
      action: 'Cancel booking',
      dialogTitle: 'Cancel this booking?',
      dialogDescription:
        'The booking will be soft-cancelled. Capacity is released automatically. The audit trail is preserved.',
      reasonLabel: 'Reason (required)',
      reasonPlaceholder: 'Why are you cancelling?',
      reasonTooShort: 'Please give a reason of at least 3 characters.',
      cancelAction: 'Keep booking',
      confirmAction: 'Cancel booking',
      cancelling: 'Cancelling…',
      toastSuccess: 'Booking cancelled.',
      toastError: 'Failed to cancel booking.',
    },
    hotelUnblock: {
      label: 'Hotel confirmed — unblock booking',
      description:
        'This will move the booking to the next stage and notify the customer. Continue?',
      cancel: 'Keep waiting',
      confirm: 'Unblock booking',
      working: 'Unblocking…',
      toastSuccess: 'Booking unblocked.',
      toastError: 'Failed to unblock booking.',
    },
    // landr-hgd4 — general approve / reject directly from the detail sheet.
    // Mirrors the generalApprovals page strings so the operator sees the same
    // wording when acting from either surface.
    generalApprove: {
      approveAction: 'Approve',
      rejectAction: 'Reject',
      approveDialogTitle: 'Approve this booking?',
      approveDialogDescription:
        'The booking will move to confirmed. You can add an optional note.',
      rejectDialogTitle: 'Reject this booking?',
      rejectDialogDescription:
        'The booking will be declined. You can add an optional note for the record.',
      noteLabel: 'Note (optional)',
      notePlaceholder: 'Optional note…',
      rejectNoteLabel: 'Reason (optional)',
      rejectNotePlaceholder: 'Why is this booking being rejected?',
      cancel: 'Cancel',
      confirmApprove: 'Approve',
      confirmReject: 'Reject',
      approving: 'Approving…',
      rejecting: 'Rejecting…',
      toastApproved: 'Booking approved.',
      toastRejected: 'Booking rejected.',
      toastError: 'Action failed.',
    },
    // landr-z4lj — Participants tab: read-only roster of booking_participants
    // (service-recipients on this booking). Distinct from the booker, who
    // is shown in the Details tab's Customer card. Clicking a participant
    // name opens ContactDetailSheet over the BookingDetailSheet (same
    // stacked-sheets pattern as Customer 360 / landr-7o2a).
    participants: {
      tabParticipants: 'Participants',
      loading: 'Loading participants…',
      error: 'Could not load participants.',
      empty: 'No participants on this booking yet.',
      columnName: 'Name',
      columnRole: 'Role',
      columnEmail: 'Email',
      columnPhone: 'Phone',
      // landr-h46a — small badge next to participants who flipped the
      // contacts.do_not_contact flag (set via the CustomerDetailSheet
      // checkbox). EmailSenderService still sends transactional kinds
      // (confirmations, hotel requests, no-show) — the badge is purely
      // an operator-facing nudge before they manually trigger a reminder.
      doNotContactBadge: 'no marketing',
      doNotContactHint:
        'This contact opted out of non-transactional emails (reminders / marketing). Booking-flow confirmations still send.',
    },
    // landr-9qo1 — operator-internal notes on a booking. Never sent to
    // the customer; staff-side only.
    notes: {
      tabNotes: 'Notes',
      // landr — accessible label for the "has notes" dot on the Notes tab.
      hasNotesIndicator: 'has notes',
      sectionTitle: 'Internal notes',
      sectionHint:
        'Staff-only. Never shown to the customer.',
      composerPlaceholder: 'Jot down an internal note…',
      composerSave: 'Save note',
      composerSaving: 'Saving…',
      composerError: 'Could not save note.',
      composerSuccess: 'Note saved.',
      empty: 'No notes yet. Write one above.',
      loading: 'Loading notes…',
      loadError: 'Could not load notes.',
      deleteLabel: 'Delete note',
      deleteConfirm: "Delete this note? It's gone for good.",
      deleteSuccess: 'Note deleted.',
      deleteError: 'Could not delete note.',
      deletedUser: '(deleted user)',
      byAuthor: (author: string, when: string): string =>
        `${author} · ${when}`,
    },
    // landr-irds — server-rendered invoice PDF download. The button lives
    // in the BookingDetailSheet footer next to Print and fetches the
    // auth-protected GET /api/staff/operators/{op}/bookings/{id}/invoice.pdf
    // endpoint, then triggers a browser download via createObjectURL.
    invoice: {
      action: 'Download invoice',
      working: 'Generating…',
      toastError: 'Failed to download invoice.',
    },
    // landr-6629 — resend confirmation email with old→new diff.
    // Button lives in the sheet footer next to Download invoice.
    // Highlighted (dot badge) when confirmation-status reports material changes.
    resendConfirmation: {
      action: 'Resend confirmation',
      working: 'Sending…',
      toastSuccess: 'Confirmation sent.',
      toastSuccessWithChanges: (n: number): string =>
        `Confirmation sent · ${n} change${n === 1 ? '' : 's'} highlighted.`,
      toastError: 'Could not resend confirmation.',
    },
    // landr-uvfg.6 — send the FIRST confirmation for never-confirmed bookings.
    // Button renders in place of "Resend confirmation" when hasPriorConfirmation=false.
    sendConfirmation: {
      action: 'Send confirmation',
      working: 'Sending…',
      toastSuccess: (customer: string): string =>
        `Confirmation sent to ${customer}.`,
      toastError: 'Could not send confirmation.',
    },
    // landr-uzup — Payments tab inside BookingDetailSheet. Lists every
    // payments + payment_refunds row with a Refund button on succeeded
    // payments. Hits POST /api/staff/operators/{op}/bookings/{bid}/
    // payments/{pid}/refund which inserts a payment_refunds row.
    payments: {
      tabPayments: 'Payments',
      loading: 'Loading payments…',
      error: 'Could not load payments.',
      empty: 'No payments recorded yet.',
      providerStripe: 'Stripe',
      providerCash: 'Cash',
      providerTransfer: 'Bank transfer',
      providerCard: 'Card',
      providerImported: 'Imported',
      statusSucceeded: 'Succeeded',
      statusPending: 'Pending',
      statusFailed: 'Failed',
      statusRefunded: 'Refunded',
      statusPartiallyRefunded: 'Partially refunded',
      refundStatusSucceeded: 'Refunded',
      refundStatusPending: 'Refund pending',
      refundStatusFailed: 'Refund failed',
      refundAction: 'Refund',
      refundDialogTitle: 'Refund this payment?',
      refundDialogDescription: (remaining: string, provider: string): string =>
        `Up to ${remaining} can be refunded on this ${provider} payment. ` +
        `Refunds are recorded immediately — make sure the money has already ` +
        `been returned to the customer.`,
      refundAmountLabel: 'Refund amount',
      refundAmountHint:
        'Defaults to the full refundable remaining. Lower it for a partial refund.',
      refundReasonLabel: 'Reason (optional)',
      refundReasonPlaceholder: 'e.g. cancelled half-day; cash returned at desk',
      refundCancel: 'Cancel',
      refundConfirm: 'Record refund',
      refundWorking: 'Recording…',
      refundToastSuccess: 'Refund recorded.',
      refundToastError: 'Failed to record refund.',
      refundedSoFar: (refunded: string, remaining: string): string =>
        `${refunded} refunded · ${remaining} remaining refundable.`,
    },
    // landr-okxm — manual "mark as paid" for payments taken outside
    // Stripe (cash, bank transfer, other). Only shown when the booking
    // is in stage code 'awaiting_payment' with a positive balance_due.
    markPaid: {
      action: 'Mark as paid',
      dialogTitle: 'Record manual payment',
      dialogDescription:
        'Use this when a customer has paid by cash, bank transfer, or another method outside Stripe. The booking will advance out of "awaiting payment" once the balance is covered.',
      methodLabel: 'Payment method',
      methodCash: 'Cash',
      methodBankTransfer: 'Bank transfer',
      methodOther: 'Other',
      amountLabel: 'Amount',
      amountHint: 'Defaults to the outstanding balance. Lower it to record a partial payment.',
      noteLabel: 'Note (optional)',
      notePlaceholder: 'e.g. paid at reception, ref #12345',
      cancel: 'Cancel',
      confirm: 'Mark as paid',
      working: 'Recording…',
      toastSuccess: 'Marked as paid.',
      toastError: 'Failed to mark as paid.',
    },
    // landr-ng3m — terminal "customer never showed" transition. Distinct
    // from cancel: the booking happened on paper, the customer didn't
    // appear. Captures (but does not yet enforce) a cancellation-fee
    // intent for a future auto-charge job.
    noShow: {
      action: 'Mark as no-show',
      dialogTitle: 'Mark this booking as no-show?',
      dialogDescription:
        'The booking will move to the No-show terminal stage. This action cannot be undone from the dashboard.',
      chargeFeeLabel: 'Charge cancellation fee',
      chargeFeeHint:
        'Records the intent in the audit log. No payment is collected automatically in this version.',
      cancel: 'Keep as is',
      confirm: 'Mark as no-show',
      working: 'Marking…',
      toastSuccess: 'Marked as no-show.',
      toastError: 'Failed to mark as no-show.',
    },
    // landr-uvfg.8 — free-form set-stage control on every booking's detail sheet.
    setStage: {
      label: 'Move to stage',
      selectPlaceholder: 'Select stage…',
      confirmTitle: 'Non-standard transition',
      confirmDescription: (from: string, to: string, warning: string): string =>
        `${warning} This transition skips the normal flow from "${from}" to "${to}".`,
      sideEffectsLabel: 'Side effects that will be skipped:',
      cancel: 'Cancel',
      confirm: 'Move anyway',
      working: 'Moving…',
      toastSuccess: (stage: string): string => `Moved to "${stage}".`,
      toastError: 'Failed to move booking.',
    },
    stage: {
      pending: 'Pending',
      awaitingGeneralApproval: 'Awaiting approval',
      awaitingSecondaryApproval: 'Awaiting secondary approval',
      awaitingHotelApproval: 'Awaiting hotel',
      confirmed: 'Confirmed',
      finalised: 'Finalised',
      cancelled: 'Cancelled',
      noShow: 'No-show',
    },
    // landr-5f8q — Timeline tab: chronological history of booking events
    // (created, approved, paid, emails sent, cancelled …). Sourced from
    // audit_log + payments + outbound_emails.
    timeline: {
      tabDetails: 'Details',
      tabTimeline: 'Timeline',
      // landr-funh — per-booking-day provider assignment tab label.
      tabProviders: 'Providers',
      loading: 'Loading timeline…',
      error: 'Failed to load timeline.',
      empty: 'No timeline events yet.',
      // landr-33r3 — per-email actions (preview + resend) on email events.
      email: {
        expand: 'Preview email',
        collapse: 'Hide preview',
        previewSubjectLabel: 'Subject',
        previewBodyHtmlLabel: 'HTML body',
        previewBodyHtmlTitle: 'Email HTML body (sandboxed preview)',
        previewBodyTextLabel: 'Plain-text body',
        sendExact: 'Send exactly this email',
        modifyAndSend: 'Modify & send',
        resentNote: (id: string): string => `Resent from a previous email (${id})`,
        // "Send exactly this email" confirmation dialog.
        confirmTitle: 'Send this email again?',
        confirmDescription:
          'An exact copy of this email will be sent — no changes.',
        confirmToLabel: 'To',
        confirmSubjectLabel: 'Subject',
        confirmCancel: 'Cancel',
        confirmSend: 'Send',
        confirmSending: 'Sending…',
        toastSuccess: 'Email resent.',
        toastError: 'Could not resend the email.',
      },
    },
    // landr-84n1 — Checklist tab: operator-private per-booking todo list.
    // v1 lives in localStorage scoped on (operator, booking_id); v2 will
    // move to a Postgres table.
    checklist: {
      tabChecklist: 'Checklist',
      progress: (done: number, total: number): string => `${done}/${total} done`,
      progressAria: (done: number, total: number): string =>
        `${done} of ${total} checklist steps complete`,
      itemAria: (label: string): string => `Toggle "${label}"`,
      addPlaceholder: 'Add a step — e.g. "Sign waiver"',
      addAction: 'Add',
      addAria: 'Add a custom checklist step',
      removeAria: (label: string): string => `Remove "${label}"`,
      empty: 'No steps yet. Add one above.',
      footnote:
        'Saved on this device. Switching devices or clearing site data resets the list.',
    },
    // landr-znzz.2 — Customer page tab: edits the customer-facing briefing
    // ("event") page — title/welcome/tone/publish/review nudge — plus the
    // per-day "tonight's update" (conditions verdict + plan + meeting point).
    briefing: {
      tabBriefing: 'Customer page',
      loading: 'Loading customer page…',
      loadError: 'Could not load the customer page.',
      // Empty / create state.
      emptyTitle: 'No customer page yet',
      emptyBody:
        'Create a customer page for this booking — share a private link, post nightly conditions, plans, and meeting points.',
      createAction: 'Create customer page',
      createWorking: 'Creating…',
      createError: 'Could not create the customer page.',
      // Share / link section.
      shareTitle: 'Share link',
      shareHint:
        "This is your customer's private page. Anyone with the link can view published content — share only within the booking group.",
      copyLink: 'Copy link',
      copyToastSuccess: 'Link copied.',
      copyToastError: 'Could not copy the link.',
      shareWhatsApp: 'Share on WhatsApp',
      openPreview: 'Open preview',
      whatsappGreeting: 'Here’s your trip page:',
      // Publish toggle.
      publishLabel: 'Published',
      publishHintOff:
        'The page is private for now — customers see nothing until you hit publish.',
      publishHintOn:
        'The page is live! Customers with the link can see all published content below.',
      // Content section.
      contentTitle: 'Page content',
      contentHint:
        'Pickup times are pulled in automatically from the day editor — no need to enter them here.',
      fieldTitle: 'Title',
      fieldTitlePlaceholder: 'e.g. Your sunrise paddle with LANDR',
      fieldWelcome: 'Welcome note',
      fieldWelcomePlaceholder:
        'A warm hello — what to expect, what to bring, how excited you are to have them.',
      fieldTone: 'Tone',
      toneOptionPlayful: 'Playful',
      toneOptionCalm: 'Calm',
      toneOptionMinimal: 'Minimal',
      // Review nudge.
      reviewTitle: 'Review nudge',
      reviewShowLabel: 'Invite a review on the page',
      reviewUrlLabel: 'Review link',
      reviewUrlPlaceholder: 'https://g.page/r/…',
      // Save (content/review).
      save: 'Save changes',
      saving: 'Saving…',
      saveToastSuccess: 'Customer page updated.',
      saveToastError: 'Could not save the customer page.',
      // Per-day section.
      daysTitle: 'Daily updates',
      daysHint:
        "Set tonight's verdict for tomorrow: is it a go? Add the plan and meeting point, then publish each day when ready. Pickup times come in automatically.",
      daysEmpty: 'This booking has no scheduled days.',
      dayConditionsLabel: 'Conditions',
      conditionPending: 'Pending',
      conditionGo: 'Go',
      conditionMarginal: 'Marginal',
      conditionNoGo: 'No go',
      dayConditionsNoteLabel: 'Why this call',
      dayConditionsNotePlaceholder:
        'e.g. clean 3ft swell, light offshore wind — perfect window at dawn.',
      dayPlanHeadlineLabel: 'Plan headline',
      dayPlanHeadlinePlaceholder: 'e.g. Dawn patrol at the point',
      dayPlanDetailLabel: 'Plan detail',
      dayPlanDetailPlaceholder:
        'What we’ll do, the running order, what to bring.',
      dayMeetingPointLabel: 'Meeting point',
      dayMeetingPointPlaceholder: 'e.g. North car park, by the kiosk.',
      dayPublishLabel: 'Published',
      dayPublishHint: 'Customers see this day only after you publish it.',
      daySave: 'Save day',
      daySaving: 'Saving…',
      daySaveToastSuccess: (day: string): string => `Saved ${day}.`,
      daySaveToastError: 'Could not save this day.',
      // Rotate token.
      rotateTitle: 'Reset link',
      rotateHint:
        "If the link got out to the wrong people, reset it — the old one dies instantly. Send the new link to your group.",
      rotateAction: 'Reset link',
      rotateConfirmTitle: 'Reset the share link?',
      rotateConfirmBody:
        "The current link stops working immediately. Everyone you've already sent it to will need the new one.",
      rotateConfirmCancel: 'Keep current link',
      rotateConfirm: 'Reset link',
      rotateWorking: 'Resetting…',
      rotateToastSuccess: 'Link reset — share the new one with your group.',
      rotateToastError: 'Could not reset the link.',
    },
  },
  calendar: {
    title: 'Calendar',
    loading: 'Loading calendar…',
    error: 'Failed to load calendar.',
    viewMonth: 'Month',
    viewWeek: 'Week',
    viewDay: 'Day',
    // landr — booking-state legend + status filter. Each calendar event is
    // tinted by its semantic state; the legend chips double as toggle filters
    // (click a state to show/hide it). Labels mirror the booking-detail stage
    // labels so the vocabulary stays consistent across the app.
    legend: {
      title: 'Status',
      states: {
        pending: 'Pending',
        confirmed: 'Confirmed',
        finalised: 'Finalised',
        cancelled: 'Cancelled',
        no_show: 'No-show',
      },
      // aria for the toggle chips — `shown` reflects the CURRENT state.
      toggleAria: (label: string, shown: boolean): string =>
        shown ? `Hide ${label} bookings` : `Show ${label} bookings`,
      // shown when the active filter hides every booking in range.
      allHidden: 'All statuses hidden — tap a status to show bookings.',
    },
    // landr — internal-note indicator on calendar events / agenda rows. The
    // dot signals "this booking has operator notes"; hovering shows them.
    noteIndicatorAria: (n: number): string =>
      `${n} internal note${n === 1 ? '' : 's'} — hover to read`,
    rescheduleError: 'Could not reschedule booking.',
    // landr-nnbm — drag-to-reschedule confirmation toast + Undo action.
    rescheduleToast: (label: string, dateLabel: string): string =>
      `${label} moved to ${dateLabel}`,
    rescheduleUndo: 'Undo',
    rescheduleUndone: 'Move undone.',
    rescheduleUndoError: 'Could not undo the reschedule.',
    // landr-f1s — off-hours expand/collapse for the time-grid views.
    // start/end may arrive as 'HH:MM' or 'HH:MM:SS'; show only HH:MM with a
    // spaced en-dash for readability ("08:00 – 20:00", never "08:00:00").
    expandOffHours: (start: string, end: string): string =>
      `Show hours outside ${start.slice(0, 5)} – ${end.slice(0, 5)}`,
    collapseOffHours: 'Hide off-hours',
    // landr-3uai — per-day capacity pill rendered in the dayGrid view when
    // a product filter is active. Click → opens the Schedule editor for
    // that date + product.
    capacityPillAria: (reserved: number, capacity: number, date: string) =>
      `${reserved} of ${capacity} reserved on ${date}. Open schedule editor.`,
    // landr-3qkr.5 — mobile agenda list mode.
    agendaToggleToGrid: 'Grid',
    agendaToggleToList: 'List',
    agendaEmpty: 'No upcoming bookings. Enjoy the calm!',
    agendaNoDate: 'Unscheduled',
    // landr-sr69 — per-day flying roster shown in each month-grid day cell
    // and the day-roster popover.
    roster: {
      /** '+N more' suffix when a day cell truncates its roster. */
      moreCount: (n: number): string => `+${n} more`,
      /** aria-label for the clickable day-cell roster summary. */
      dayCellAria: (count: number, dayNumber: string): string =>
        `${count} ${count === 1 ? 'pilot' : 'pilots'} flying on ${dayNumber}. Open day roster.`,
      /** Popover heading: count of flying participants that day. */
      panelHeading: (count: number): string =>
        `${count} ${count === 1 ? 'pilot' : 'pilots'} flying`,
      /** Empty roster (shouldn't normally render — defensive). */
      panelEmpty: 'No pilots flying this day.',
    },
  },
  contacts: {
    title: 'Contacts',
    // landr-fnhz — topbar subtitle. Shows total contact count so the
    // operator can eyeball list size without scrolling.
    subtitleCount: (n: number): string =>
      `${n} ${n === 1 ? 'contact' : 'contacts'}`,
    empty: 'No contacts here yet.',
    error: 'Failed to load contacts.',
    columnName: 'Name',
    columnEmail: 'Email',
    columnPhone: 'Phone',
    columnCreated: 'Created',
    columnStatus: 'Status',
    columnActions: 'Actions',
    // landr-iz58 — operator-applied tag chips.
    columnTags: 'Tags',
    filterPlaceholder: 'Search contacts…',
    // landr-xnpc — download the filtered view as CSV.
    exportCsv: 'Download CSV',
    exportCsvAria: (n: number): string =>
      `Download ${n} filtered contacts as CSV`,
    statusActive: 'Active',
    statusErased: 'Erased',
    actionErase: 'GDPR erase',
    actionAudit: 'Audit log',
    actionEraseShort: 'Erase',
    erasing: 'Erasing…',
    eraseToastSuccess: 'Contact erased and audit log scrubbed.',
    eraseToastError: 'GDPR erase failed.',
    auditTitle: 'Audit log',
    auditEmpty: 'No audit entries.',
    auditLoading: 'Loading audit log…',
    auditError: 'Failed to load audit log.',
    eraseDialogTitle: 'Trigger GDPR erase',
    eraseDialogIntro:
      'This will scrub all PII from this contact, the audit log, and any linked bookings. Commercial fields are preserved per Spanish 6-year retention. This action is irreversible.',
    eraseDialogConfirmLabel: 'Type ERASE to confirm',
    eraseDialogReasonLabel: 'Jurisdiction note (required)',
    eraseDialogReasonPlaceholder: 'e.g. GDPR Art. 17 request via email 2026-05-…',
    eraseDialogCancel: 'Cancel',
    eraseDialogSubmit: 'Erase contact',
    // landr-oxlk — right-click context menu on a Contacts row. Mirrors
    // the action labels in the actions column / detail sheet so the
    // wording stays consistent.
    rowContextMenu: {
      openDetail: 'Open contact',
      copyLink: 'Copy link',
      applyTag: 'Apply tag',
      tagsLoading: 'Loading tags…',
      tagsEmpty: 'No tags yet.',
      tagSelectedMark: '✓',
      tagsToastError: 'Failed to update contact tags.',
      erase: 'Erase (GDPR)',
    },
    // landr-pqk — sort dropdown + derived-type filter chips.
    filters: {
      sortLabel: 'Sort',
      sortRecentlyAdded: 'Recently added',
      sortRecentlyChanged: 'Recently changed',
      sortAlphabetical: 'Alphabetical',
      // landr-6993 — sort by the next booking date (nearest-future first).
      sortNextBooking: 'Next booking',
      typeLabel: 'Type',
      typeLabels: {
        customer: 'Customer',
        attendee: 'Attendee',
        employee: 'Employee',
        agent: 'Agent',
      } as Record<string, string>,
      clearAll: 'Clear filters',
      // landr-dp45 — view toggle to surface GDPR-erased tombstones.
      showErasedLabel: 'Show erased contacts',
      // landr-knz3 — tooltip shown on a chip when its count=0 so the
      // operator understands the chip is intentionally non-clickable.
      noOfType: (label: string): string =>
        `No contacts of type ${label.toLowerCase()}`,
      // landr-6993 — booking-window chips ('today' / 'future'). Labels
      // are short imperative so they stack with the type chip row.
      bookingLabel: 'Bookings',
      bookingTodayLabel: 'Has booking today',
      bookingFutureLabel: 'Has future booking',
      // landr-6993 — per-row icon + tooltip for the upcoming-booking cell.
      iconNextBookingTooltip: (dateLabel: string): string =>
        `Next booking: ${dateLabel}`,
      iconNoUpcomingTooltip: 'No upcoming bookings',
      iconTodayAria: 'Has booking today',
      iconFutureAria: 'Has future booking',
    },
    // landr-panu — customer segments (tag-based saved groups). Operators
    // pick a tag combination once, save it as a named segment, and reuse
    // it as a one-click chip filter above the table.
    segments: {
      label: 'Segments',
      tagsLabel: 'Tags',
      addTagPlaceholder: 'Filter by tag…',
      addTagButton: 'Filter by tag',
      saveAsSegment: 'Save as segment…',
      manageButton: 'Manage segments',
      clearTagFilter: 'Clear tag filter',
      saveDialogTitle: 'Save segment',
      saveDialogDescription:
        'Turn the current tag filter into a one-click chip you can reuse any time.',
      saveNameLabel: 'Segment name',
      saveNamePlaceholder: 'e.g. VIP returning customers',
      saveTagsLabel: 'Tags in this segment',
      saveColorLabel: 'Chip color',
      saveSubmit: 'Save segment',
      saveCancel: 'Cancel',
      saveValidationName: 'Give your segment a name first.',
      saveValidationTags: 'Pick at least one tag.',
      toastCreated: (name: string): string => `Segment "${name}" saved!`,
      toastUpdated: (name: string): string => `Segment "${name}" updated.`,
      toastDeleted: (name: string): string => `Segment "${name}" removed.`,
      manageDialogTitle: 'Manage segments',
      manageDialogDescription:
        'Rename, recolor, or delete your saved segments.',
      manageEmpty: 'No saved segments yet. Tag your bookings above and hit "Save as segment…" to keep a handy filter.',
      manageEdit: 'Edit',
      manageDelete: 'Delete',
      manageClose: 'Close',
      // Aria labels.
      ariaApply: (name: string): string => `Apply segment ${name}`,
      ariaActive: (name: string): string => `Segment ${name} is active`,
      ariaDeleteConfirm: (name: string): string =>
        `Delete segment '${name}'? This can't be undone.`,
    },
  },
  customerDetail: {
    title: 'Customer',
    loading: 'Loading customer…',
    error: 'Could not load customer.',
    fieldFirstName: 'First name',
    fieldLastName: 'Last name',
    fieldEmail: 'Email',
    fieldPhone: 'Phone',
    fieldPreferredLocale: 'Preferred language',
    localeNone: '— No preference —',
    // landr-h46a — opt-out for non-transactional outbound emails.
    fieldDoNotContact:
      'This contact does not want to receive marketing or reminder emails',
    fieldDoNotContactHelp:
      'Booking confirmations, hotel requests, and other transactional emails still send.',
    save: 'Save changes',
    saving: 'Saving…',
    cancel: 'Cancel',
    close: 'Close',
    noChanges: 'Nothing to save yet.',
    invalidEmail: 'Enter a valid email address.',
    toastSuccess: 'Customer updated.',
    toastError: 'Could not update customer.',
    // landr-iz58 — operator-scoped tag picker shown inside the form.
    tagsLabel: 'Tags',
    tagsToastError: 'Could not update tags.',
    discardTitle: 'Discard unsaved changes?',
    discardDescription:
      'You have unsaved edits — closing now will lose them.',
    discardCancel: 'Keep editing',
    discardConfirm: 'Discard',
    openAriaLabel: (name: string) => `Open customer ${name}`,
    // landr-7o2a — Customer 360 "Bookings" tab. Lists every booking
    // (past + upcoming) the contact has placed. Mirrors the inline-tablist
    // pattern from BookingDetailSheet (landr-5f8q).
    bookings: {
      tabDetails: 'Details',
      tabBookings: 'Bookings',
      loading: 'Loading bookings…',
      error: 'Failed to load bookings.',
      empty: 'No bookings yet.',
      columnDate: 'Date',
      columnProduct: 'Product',
      columnStatus: 'Status',
      columnTotal: 'Total',
      // "12 bookings, €1,234 total" header — count + currency-formatted sum.
      summary: (count: number, total: string): string =>
        `${count} ${count === 1 ? 'booking' : 'bookings'}, ${total} total`,
      rowAriaLabel: (label: string) => `Open booking ${label}`,
      // landr-ajb4 — Open / Past section split. "Open" = current or
      // upcoming bookings (non-terminal stage OR service date today/later);
      // "Past" = terminal stage AND service date strictly before today.
      sectionOpenLabel: 'Open',
      sectionPastLabel: 'Past',
      sectionOpenEmpty: 'No open bookings',
      sectionPastEmpty: 'No past bookings',
    },
  },
  products: {
    title: 'Products & pricing',
    loading: 'Loading products…',
    error: 'Failed to load products.',
    empty: 'No products yet — create your first one to get started.',
    noMatches: 'No products match your search.',
    filterPlaceholder: 'Search products…',
    listAriaLabel: 'Products',
    createNew: 'New product',
    headingNew: 'New product',
    headingPick: 'Select a product',
    pickHint: 'Pick a product on the left to edit, or create a new one.',
    backToList: 'Back to products',
    statusActive: 'Active',
    statusInactive: 'Inactive',
    // landr-7zc5.2 — publish state badge + preview affordance.
    statusDraft: 'Draft',
    publishProduct: 'Publish',
    unpublishProduct: 'Unpublish',
    publishingProduct: 'Publishing…',
    unpublishingProduct: 'Unpublishing…',
    toastPublished: "Product published — it's live!",
    toastUnpublished: 'Product moved back to draft.',
    previewProductAria: (name: string) => `Preview draft — ${name}`,

    fieldName: 'Name',
    fieldNameHelp:
      'Short product label shown everywhere (dashboard, widget, emails).',
    fieldSlug: 'Slug',
    fieldSlugHint: 'Lowercase, used in URLs. Must be unique per operator.',
    fieldShortDescription: 'Short description',
    fieldShortDescriptionHelp:
      'One-line tagline shown under the name in the booking widget.',
    fieldDescription: 'Description',
    fieldDescriptionHelp:
      'Long Markdown description shown in the widget product card body. Optional.',
    fieldDescriptionHint: 'Markdown supported — **bold**, _italic_, lists, links.',
    fieldProductKind: 'Product kind',
    fieldProductKindTeaserHint:
      'Options marked with a crown are available on higher plans.',
    fieldServiceTimeShape: 'Time model',
    fieldIsContiguous: 'Whole-range (contiguous days)',
    fieldIsContiguousHint:
      'On: the customer books an unbroken stretch of days. Off: they pick individual days.',
    fieldDurationMinutes: 'Duration (minutes)',
    fieldFixedStartDate: 'Fixed start date',
    fieldFixedEndDate: 'Fixed end date',
    fieldFixedDatesHint: 'Leave both empty for a floating date range.',
    fieldPricingScheme: 'Discount scheme',
    fieldPricingSchemeHint:
      'Optional — applied to all bookings of this product. Leave blank for no automatic discount.',
    manageDiscountSchemes: 'Manage discount schemes',
    fieldProductGroup: 'Product group',
    manageProductGroups: 'Manage product groups',
    productGroupManagerTitle: 'Product groups',
    productGroupManagerDescription:
      'Marketing groupings shown as filter chips in the booking widget. Add, rename, or delete groups for this operator.',
    productGroupManagerEmpty: 'No groups yet — add one below.',
    productGroupManagerAddTitle: 'Add group',
    productGroupManagerEditTitle: 'Rename group',
    productGroupManagerNameLabel: 'Name',
    productGroupManagerSave: 'Save',
    productGroupManagerCancel: 'Cancel',
    productGroupManagerEditAria: (name: string) => `Edit group — ${name}`,
    productGroupManagerDeleteAria: (name: string) => `Delete group — ${name}`,
    productGroupManagerDeleteConfirm: (name: string) =>
      `Delete product group "${name}"? Products still attached to it will fall back to no group.`,
    productGroupManagerToastCreated: 'Group added.',
    productGroupManagerToastUpdated: 'Group updated.',
    productGroupManagerToastDeleted: 'Group deleted.',
    productGroupManagerToastError: 'Could not save group.',
    // landr-d8rg.10 — per-group cover image + description tagline
    productGroupCoverLabel: 'Cover image',
    productGroupCoverUpload: 'Upload cover',
    productGroupCoverReplace: 'Replace',
    productGroupCoverRemove: 'Remove',
    productGroupCoverUploading: 'Uploading…',
    productGroupCoverAlt: (name: string) => `Cover image for ${name}`,
    productGroupCoverToastUploaded: 'Cover image saved.',
    productGroupCoverToastRemoved: 'Cover image removed.',
    productGroupCoverToastError: 'Could not save cover image.',
    productGroupCoverToastRemoveError: 'Could not remove cover image.',
    productGroupDescriptionLabel: 'Tagline',
    productGroupDescriptionPlaceholder: 'One-line tagline shown in the booking widget…',
    fieldSortOrder: 'Sort order',
    optionNone: '— None —',

    legendFlags: 'Flags',
    flagActive: 'Active',
    flagPubliclyListed: 'Publicly listed',
    flagNeedsProvider: 'Needs a provider',
    flagNeedsPickup: 'Needs pickup',
    flagRevenueThroughOperator: 'Revenue flows through operator',
    flagRevenueThroughOperatorHint:
      'On: this product\'s price counts toward the guest\'s Booking total, collected through your operator account at checkout. Off: the guest pays you directly (e.g. at check-in) — the widget shows this amount separately and excludes it from the Booking total.',
    // landr-u34k — is_addon_only checkbox + section copy. The flag hides
    // the product from the main list and restricts purchase to add-on
    // flows; the section manages product_addons rows for the current
    // parent product.
    flagAddonOnly: 'Add-on only',
    flagAddonOnlyHint:
      'Hide from main product list — only available as an add-on of another product.',
    showAddonsToggle: 'Show add-on products',
    addonsSectionTitle: 'Add-ons',
    addonsSectionBody:
      'Link other products as add-ons for this one. The booking widget surfaces them alongside the parent product.',
    addonsSaveFirstHint:
      'Save this product first to manage its add-ons.',
    addonsLoading: 'Loading add-ons…',
    addonsEmpty: 'No add-ons linked yet.',
    addonsAddNew: 'Add add-on',
    addonsListAriaLabel: 'Add-ons',
    addonsPickProduct: '— Pick a product —',
    addonsNoOtherProducts:
      'Create at least one other product before linking add-ons.',
    addonsFieldAddon: 'Add-on product',
    addonsFieldRequired: 'Required',
    addonsFieldMinQty: 'Min',
    addonsFieldMaxQty: 'Max',
    addonsFieldMaxQtyPlaceholder: '∞',
    addonsFieldSortOrder: 'Sort',
    addonsSave: 'Save',
    addonsSaving: 'Saving…',
    addonsAdd: 'Add',
    addonsDelete: 'Remove add-on',
    addonsErrorPickProduct: 'Pick an add-on product first.',

    kindService: 'Service',
    kindSubscription: 'Subscription',
    kindDigitalGood: 'Digital good',
    kindPhysicalGood: 'Physical good',
    kindGiftCard: 'Gift card',
    kindHotelRoom: 'Hotel room',

    // landr-ssrx — hotel_room fields + hotel_offering control on services.
    fieldHotelLocation: 'Hotel',
    fieldHotelLocationHint:
      'Pick the hotel this room belongs to. Only locations tagged with the "hotel" role appear here — add the hotel under Pickup locations first if it is missing.',
    fieldHotelLocationEmpty: '— Select a hotel —',
    fieldHotelLocationNoneAvailable:
      'No hotel-role locations yet. Add one under Pickup locations first.',
    hotelRoomHelperBody:
      'Hotel room prices are displayed per night to guests but paid directly to the hotel. Revenue does not flow through your operator account.',
    // landr-knm0 — capacity_per_unit input on hotel_room products.
    fieldRoomCapacity: 'Room capacity (people)',
    fieldRoomCapacityHint:
      'How many guests fit in one of these rooms. Defaults follow the room name (single → 1, double/twin → 2, triple → 3, family → 4).',
    errorRoomCapacityRequired: 'Room capacity must be at least 1.',
    // landr-c53m.4 — includes_breakfast checkbox on hotel_room products.
    fieldIncludesBreakfast: 'Includes breakfast',
    fieldIncludesBreakfastHint:
      'On: the room rate includes breakfast, and the booking confirmation email mentions it. Off: no breakfast copy is added.',
    fieldHotelOffering: 'Includes accommodation',
    fieldHotelOfferingHint:
      'When the booking widget should add a hotel step on top of this service.',
    optionHotelOfferingNone: 'No — no hotel step',
    optionHotelOfferingOptional: 'Optional — show with a skip',
    optionHotelOfferingMandatory: 'Mandatory — require a hotel pick',
    listGroupHotelPrefix: 'Hotel: ',
    listGroupHotelUnassigned: 'Unassigned hotel rooms',

    // landr-pugm — sort dropdown + product_kind chip filters.
    filters: {
      sortLabel: 'Sort',
      sortRecentlyAdded: 'Recently added',
      sortRecentlyChanged: 'Recently changed',
      sortAlphabetical: 'Alphabetical',
      kindLabel: 'Kind',
      clearAll: 'Clear filters',
      // landr-knz3 — tooltip shown on a chip when its count=0 so the
      // operator understands the chip is intentionally non-clickable.
      noOfKind: (label: string): string =>
        `No products of kind ${label.toLowerCase()}`,
    },

    shapeSingleDate: 'Single date',
    shapeDaysRange: 'Day picker (days range)',
    shapeFixedWindow: 'Course window (fixed date range)',
    shapeTimeSlot: 'Time slot',

    nonServiceComingSoonTitle: 'Coming soon — Shop UI',
    nonServiceComingSoonBody:
      'Configuration for non-service product kinds lives in the upcoming Shop surface (see landr-vh9 epic). This product kind is not editable here yet.',
    nonServiceDisabledTooltip:
      'This product kind requires the upcoming Shop surface (see landr-vh9 epic).',
    physicalGoodComingSoonBody:
      'Inventory & shipping for physical goods will be configured in the upcoming Shop surface.',

    save: 'Save changes',
    saving: 'Saving…',
    create: 'Create product',
    delete: 'Delete',
    deleting: 'Deleting…',
    confirmDelete:
      'Delete this product? This is a soft delete — it can be restored from the database if needed.',
    confirmDiscardChanges: 'You have unsaved changes. Discard them?',

    saveAndContinue: 'Save',
    saveKeepsOpenHint:
      'Saved — the panel stays open so you can add add-on products below.',

    formCreateLabel: 'Create product form',
    formEditLabel: 'Edit product form',

    toastCreated: 'Product created!',
    toastUpdated: 'Product saved.',
    toastDeleted: 'Product deleted.',
    // landr-v6aq — fallback used in the undo toast when the product row
    // is no longer in cache (e.g. the operator typed in the filter so
    // hard the only matching row is the one being deleted).
    deletedFallbackLabel: 'product',
    slugCollisionTitle: 'That slug is already taken',
    slugCollisionBody:
      'A product with this slug already exists for your operator. Pick a different name or edit the slug.',
    duplicate: 'Duplicate',
    duplicating: 'Duplicating…',
    toastDuplicated: 'Product duplicated — tweak it and save.',

    errorNameRequired: 'Name is required.',
    errorSlugRequired: 'Slug is required.',
    errorSlugFormat: 'Slug may only contain letters, numbers and hyphens.',
    errorDurationRequired: 'Time-slot products must specify a duration.',
    errorDateRangePaired: 'Set both the start and end date, or neither.',
    fixedDateWindowsHeading: 'Course windows',
    fixedDateWindowsHint:
      'Operator-published windows customers can book. Each window has its own capacity.',
    windowColumnStart: 'Start',
    windowColumnEnd: 'End',
    windowColumnCapacity: 'Capacity',
    windowColumnReserved: 'Reserved',
    windowColumnActive: 'Active',
    windowColumnActions: '',
    windowAddButton: 'Add window',
    windowEditButton: 'Edit',
    windowDeleteButton: 'Delete',
    windowSaveAdd: 'Add',
    windowSaveEdit: 'Save',
    windowCancel: 'Cancel',
    windowEmpty: 'No windows yet — add one to make this product bookable.',
    windowFormStart: 'Start date',
    windowFormEnd: 'End date',
    windowFormCapacity: 'Capacity',
    windowConfirmDelete: 'Delete this window?',
    windowErrorRange: 'End date must be on or after start date.',
    windowErrorCapacity: 'Capacity must be at least 1.',
    windowErrorLoad: 'Failed to load course windows.',
    windowErrorSave: 'Failed to save window.',
    windowErrorDelete: 'Failed to delete window.',

    // landr-d8rg.9 — product image manager
    imagesSectionTitle: 'Product images',
    imagesSaveFirstHint: 'Save this product first to manage its images.',
    imagesCounter: (n: number, max: number): string => `${n}/${max}`,
    imagesAddButton: 'Add image',
    imagesAddAriaLabel: 'Add product image',
    imagesAltLabel: 'Alt text',
    imagesAltPlaceholder: 'Describe the image for accessibility…',
    imagesMoveUp: 'Move up',
    imagesMoveDown: 'Move down',
    imagesDelete: 'Delete image',
    imagesUploading: 'Uploading…',
    imagesToastUploaded: 'Image uploaded.',
    imagesToastUploadError: 'Could not upload image.',
    imagesToastDeleted: 'Image deleted.',
    imagesToastDeleteStorageError: 'Image row deleted, but storage cleanup failed.',
    imagesToastAltSaved: 'Alt text saved.',
    imagesToastAltError: 'Could not save alt text.',
    imagesToastReorderError: 'Could not reorder images.',
    imagesEmpty: 'No images yet. Add up to 4.',
    imagesLoading: 'Loading images…',
    imagesLoadError: 'Failed to load images.',
  },
  // landr-14s4 — shared locale-tabbed text editor (LocalizedTextField).
  // The widget renders the base (English) field when a locale override is
  // absent, so an empty override === "inherits English".
  localized: {
    baseTab: 'EN (base)',
    // Tablist label — kept distinct from the field's own label so the base
    // editor's aria-label stays the single match for getByLabelText(name).
    tablistAria: (label: string) => `${label} — language`,
    overrideTabAria: (label: string) => `Translation — ${label}`,
    overrideBadgeAria: (label: string) => `${label} has a translation`,
    inheritsBaseHint: 'Empty — inherits the English text above.',
    basePlaceholder: 'English text shown by default',
    overridePlaceholderPrefix: 'Translation for ',
  },
  generalApprovals: {
    title: 'Approvals',
    // landr-fnhz — topbar subtitle. Mirrors the pendingCount badge in
    // the page header so the count is also visible when the user has
    // scrolled the page down.
    subtitleCount: (n: number): string =>
      n === 0 ? "Nothing pending — you're all clear!" : `${n} pending`,
    // landr-aqn4 — friendlier empty state ('All caught up').
    empty: 'All clear — no pending approvals.',
    error: 'Failed to load approval queue.',
    // landr-aqn4 — count badge next to the page title.
    pendingCount: (n: number): string => `${n} pending`,
    columnDate: 'Requested',
    // landr-aqn4 — new activity-date column. Sorted alongside the
    // request date column so operators can prioritise by when the
    // booking is *happening*, not when it was *submitted*.
    columnActivityDate: 'Activity',
    // landr-qmdo — "Awaiting X" stage chip column. Sorted by stage code
    // so operators can batch by "all the Hotel ones" / "all secondary".
    columnStage: 'Stage',
    columnCustomer: 'Customer',
    columnProduct: 'Product',
    columnPrice: 'Price',
    columnActions: 'Actions',
    actionApprove: 'Approve',
    actionReject: 'Reject',
    approveDialogTitle: 'Approve booking',
    approveDialogDescription:
      'The booking will move to confirmed. You can add an optional note.',
    rejectDialogTitle: 'Reject booking',
    rejectDialogDescription:
      'The booking will be declined. You can add an optional note for the record.',
    notePlaceholder: 'Optional note…',
    noteLabel: 'Note (optional)',
    cancel: 'Cancel',
    confirmApprove: 'Approve',
    confirmReject: 'Reject',
    approving: 'Approving…',
    rejecting: 'Rejecting…',
    toastApproved: 'Booking approved.',
    toastRejected: 'Booking rejected.',
    toastError: 'Action failed.',
    // landr-oxlk — right-click context menu on an Approvals row. Mirrors
    // the inline Approve/Reject buttons; selecting Approve/Reject opens
    // the same confirmation dialog the buttons do.
    rowContextMenu: {
      openDetail: 'Open booking',
      approve: 'Approve',
      reject: 'Reject',
    },
    // landr-xnpc — download the filtered approval queue as CSV.
    exportCsv: 'Download CSV',
    exportCsvAria: (n: number): string =>
      `Download ${n} filtered approvals as CSV`,
    // landr-aqn4 — filter bar above the table.
    filters: {
      reason: 'Reason',
      product: 'Product',
      customerStatus: 'Customer',
      urgency: 'Urgency',
      price: 'Price',
      // landr-qmdo — "Awaiting X" stage filter dim (Operator review /
      // Secondary approver / Hotel). Orthogonal to the other dims.
      stage: 'Awaiting',
      clearAll: 'Clear filters',
      noOptions: 'No options to filter by yet.',
      activeCount: (n: number): string => ` (${n})`,
      reasonLabels: {
        capacity_warning: 'Capacity',
        new_customer: 'New customer',
        voucher_invalid: 'Voucher',
        manual_override: 'Override',
        other: 'Other',
      } as Record<string, string>,
      // landr-qmdo — labels for the three Approvals stage buckets. These
      // match the per-row StageChip labels so the operator sees the same
      // wording on the chip and in the filter dropdown.
      stageLabels: {
        general: 'Operator review',
        secondary: 'Secondary approver',
        hotel: 'Hotel review',
      } as Record<string, string>,
      customerStatusLabels: {
        new: 'New',
        returning: 'Returning',
      } as Record<string, string>,
      urgencyLabels: {
        urgent: 'Urgent (≤3d)',
        soon: 'Soon (4–14d)',
        later: 'Later (15+d)',
        unknown: 'Unscheduled',
      } as Record<string, string>,
      priceLabels: {
        low: '<100 €',
        mid: '100–500 €',
        high: '500 €+',
      } as Record<string, string>,
      // Tooltip shown on a counted chip when its count=0.
      noOfValue: (label: string): string => `No bookings match ${label}`,
    },
  },
  // landr-lbbj — bulk-select toolbar shown on Approvals + Bookings tables
  // once one or more row checkboxes are ticked. Reused across both pages
  // (the component itself decides which actions to expose via props).
  bulkActions: {
    selectRowAria: (id: string) => `Select row ${id}`,
    selectAllAria: 'Select all rows on this page',
    selectionCount: (n: number) =>
      n === 1 ? '1 selected' : `${n} selected`,
    clear: 'Clear',
    approve: 'Approve',
    reject: 'Reject',
    exportCsv: 'Export CSV',
    sendReminder: 'Send reminder',
    confirmRejectTitle: 'Reject selected bookings?',
    confirmRejectDescription: (n: number) =>
      n === 1
        ? 'This will mark 1 booking as rejected. You cannot undo this from here.'
        : `This will mark ${n} bookings as rejected. You cannot undo this from here.`,
    confirmRejectAction: 'Reject',
    cancel: 'Cancel',
    working: 'Working…',
    toastApproved: (n: number) =>
      n === 1 ? 'Approved 1 booking' : `Approved ${n} bookings`,
    toastRejected: (n: number) =>
      n === 1 ? 'Rejected 1 booking' : `Rejected ${n} bookings`,
    toastReminderSent: (n: number) =>
      n === 1 ? '1 reminder sent' : `${n} reminders sent`,
    // landr-vaob — partial-failure variant for the bulk-reminder endpoint
    // (POST /api/staff/operators/{op}/bookings/bulk-reminder, landr-s0wo).
    // The endpoint is best-effort per booking — cross-tenant ids and
    // template/enqueue failures both surface in `failed` rather than
    // aborting the batch, so the toast must distinguish "N sent, M failed"
    // from the all-success and all-fail paths.
    toastReminderPartial: (ok: number, fail: number) =>
      `${ok} sent, ${fail} failed`,
    toastExported: (n: number) =>
      n === 1 ? 'Exported 1 booking to CSV' : `Exported ${n} bookings to CSV`,
    // Partial failure: some rows succeeded, some didn't.
    toastPartial: (ok: number, fail: number) =>
      `${ok} succeeded, ${fail} failed`,
    toastError: 'Bulk action failed',
    // landr-uqr2 — "Apply tag" action surfaced on Bookings + Contacts.
    // Clicking the toolbar button reveals a TagPicker; submit fans the
    // chosen tags out to every selected row via bulkApplyTagsTo{...}.
    applyTags: 'Apply tag',
    applyTagsPopoverTitle: 'Apply tags to selection',
    applyTagsPopoverHint: (n: number) =>
      n === 1
        ? 'Pick one or more tags to add to the selected row.'
        : `Pick one or more tags to add to the ${n} selected rows.`,
    applyTagsConfirm: 'Apply',
    applyTagsConfirmBusy: 'Applying…',
    toastTagsApplied: (rows: number, tags: number) => {
      const rowLabel = rows === 1 ? '1 row' : `${rows} rows`
      const tagLabel = tags === 1 ? '1 tag' : `${tags} tags`
      return `Applied ${tagLabel} to ${rowLabel}`
    },
    toastTagsPartial: (ok: number, fail: number) =>
      `${ok} tagged, ${fail} failed`,
  },
  staff: {
    title: 'Staff',
    subtitle:
      'Manage your crew — memberships, roles, and per-user permissions all in one place.',
    loading: 'Loading staff…',
    error: 'Failed to load staff.',
    empty: 'No crew members yet. Use "Invite by email" to bring someone aboard.',
    listAriaLabel: 'Staff memberships',
    filterPlaceholder: 'Search staff…',
    matches: (n: number, total: number) => `${n} / ${total}`,

    columnEmail: 'Email',
    columnRole: 'Role',
    columnPermissions: 'Permissions',
    columnJoined: 'Joined',
    columnActions: 'Actions',

    actionInvite: 'Invite by email',
    actionEdit: 'Edit',
    actionRevoke: 'Revoke',

    // Invite sheet
    inviteTitle: 'Invite by email',
    inviteDescription:
      'Add someone to this operator account. They must have signed in to LANDR at least once (via the mobile app or dashboard).',
    inviteEmailLabel: 'Email',
    inviteEmailPlaceholder: 'staff@example.com',
    inviteRoleLabel: 'Role',
    invitePermissionsLabel: 'Permissions (JSON)',
    invitePermissionsHint:
      'Optional JSON object. Example: { "manage_bookings": true, "view_revenue": false }',
    inviteSubmit: 'Add membership',
    inviteSubmitting: 'Adding…',
    inviteCancel: 'Cancel',
    inviteToastSuccess: 'Team member added.',
    inviteToastError: 'Could not add team member.',
    inviteUserNotFound:
      'No account found with that email. They need to sign in to LANDR at least once first.',
    inviteEmailRequired: 'Enter a valid email address.',
    inviteRoleRequired: 'Role is required.',

    inviteDeferralNotice:
      'Email-invite send is deferred (landr-m05.15 Gmail OAuth). For now, the user must already be signed in to LANDR — this just links them to this operator.',

    // Edit sheet
    editTitle: 'Edit membership',
    editRoleLabel: 'Role',
    editPermissionsLabel: 'Permissions (JSON)',
    editPermissionsHint:
      'Leave empty for no overrides. Must be a JSON object if set.',
    editSubmit: 'Save changes',
    editSubmitting: 'Saving…',
    editCancel: 'Cancel',
    editToastSuccess: 'Membership updated.',
    editToastError: 'Could not update membership.',

    // Revoke confirm dialog
    revokeTitle: 'Revoke access?',
    revokeDescription:
      "This removes the membership for this user. They'll no longer see this operator. Their LANDR account is not affected.",
    revokeConfirm: 'Type REVOKE to confirm',
    revokeCancel: 'Cancel',
    revokeSubmit: 'Revoke access',
    revokeSubmitting: 'Revoking…',
    revokeToastSuccess: 'Access revoked.',
    revokeToastError: 'Could not revoke access.',
  },
  settings: {
    title: 'Settings',
    noOperator: 'No operator selected.',
    loading: 'Loading settings…',
    error: 'Failed to load settings.',
    save: 'Save changes',
    saving: 'Saving…',
    toastSuccess: 'Settings saved.',
    toastError: 'Could not save settings.',

    sectionCompany: 'Company',
    sectionCompanyDesc: 'Your public-facing company identity. Slug is read-only.',
    sectionTax: 'Tax & Legal',
    sectionContact: 'Contact & Address',
    sectionLocale: 'Locale',
    sectionCalendar: 'Calendar & display',
    sectionCalendarDesc:
      'Set your working hours and format. The primary view shows only your chosen window; off-hours tuck away into a strip you can expand.',
    sectionDisplayPrefs: 'Display preferences',
    sectionDisplayPrefsDesc:
      'Choose which product types and upgrade nudges appear in the dashboard.',
    fieldShowPremiumTeasers: 'Show upgrade prompts for premium features',
    fieldShowPremiumTeasersHint:
      'When on, your dashboard surfaces product types available on higher plans.',
    fieldShowPremiumTeasersFreeLockedHint:
      "Always shown on Free plan so you know what's waiting for you.",
    sectionIntegrations: 'Integrations',
    sectionIntegrationsDesc: 'Connect third-party services to your operator account.',

    fieldName: 'Company name',
    fieldLegalName: 'Legal name',
    fieldSlug: 'Slug',
    fieldSlugHint: 'Read-only. Used in URLs.',
    fieldTaxId: 'Tax ID',
    fieldTaxIdKind: 'Tax ID type',
    fieldPhone: 'Phone',
    fieldStreet: 'Street',
    fieldCity: 'City',
    fieldPostalCode: 'Postal code',
    fieldRegion: 'Region / State',
    fieldCountry: 'Country (ISO-3166 alpha-2)',
    fieldTimezone: 'Timezone (IANA)',
    fieldLocale: 'Default locale',
    // landr-x5o5.7 — hotel-facing email language in Settings → Company.
    fieldHotelEmailLocale: 'Hotel email language',
    fieldHotelEmailLocaleHint:
      'Language for all hotel-facing emails (hotel request, hotel confirmation). '
      + 'Leave blank to use the default locale above. '
      + 'Setting this here controls the pin shown in Email templates.',
    fieldWorkHoursStart: 'Work hours — start',
    fieldWorkHoursEnd: 'Work hours — end',
    fieldWorkHoursHint:
      'Defaults to 08:00 – 20:00. Calendar renders this window first; off-hours are one collapsible strip.',
    fieldTimeFormat: 'Time format',
    timeFormat24h: '24-hour (13:05)',
    timeFormat12h: '12-hour AM/PM (1:05 PM)',
    // landr-m4zq — first day of week. v1 exposes Sunday / Monday; the DB
    // column accepts 0..6 so other anchors can land without a migration.
    fieldFirstDayOfWeek: 'First day of week',
    fieldFirstDayOfWeekHint:
      'Drives the calendar column order and the start of relative-date ranges like "This week".',
    firstDayOfWeekSunday: 'Sunday',
    firstDayOfWeekMonday: 'Monday',
    optionNone: '— Select —',

    // landr-yp8x — operator branding (logo + primary colour).
    // landr-znzz.11 — extended to full 3-colour semantic theme + dark logo.
    // landr-ylvp — page H1 renamed Branding → Brand to match the section label.
    sectionBranding: 'Brand',
    fieldLogo: 'Logo (light)',
    fieldLogoHint:
      'Square PNG or SVG works best (max 2 MB). Shown at the top of every booking step.',
    fieldLogoNone: 'No logo uploaded yet.',
    fieldLogoUpload: 'Upload logo',
    fieldLogoReplace: 'Replace logo',
    fieldLogoRemove: 'Remove logo',
    fieldLogoUploading: 'Uploading…',
    fieldLogoDark: 'Dark-mode logo (optional)',
    fieldLogoDarkHint:
      "Used when the visitor's device is in dark mode. Leave blank to use the same logo.",
    fieldLogoDarkNone: 'No dark-mode logo uploaded.',
    fieldLogoDarkUpload: 'Upload dark logo',
    fieldLogoDarkReplace: 'Replace dark logo',
    fieldLogoDarkRemove: 'Remove dark logo',
    fieldLogoDarkUploading: 'Uploading…',
    // landr-znzz.11 — 3-colour theme fields
    themeSectionTitle: 'Theme colours',
    themeSectionDesc:
      'Three colour slots shape the widget. Brand is headings and text, Accent is buttons, Background is the canvas.',
    fieldBrandColor: 'Brand colour (text / headings)',
    fieldAccentColor: 'Accent colour (buttons)',
    fieldBackgroundColor: 'Background colour',
    darkOverridesSectionTitle: 'Dark-mode overrides (optional)',
    darkOverridesSectionDesc:
      "Leave blank and the browser handles dark mode automatically. Only override if the auto-derived colours clash with your brand.",
    fieldDarkBrandColor: 'Dark brand colour',
    fieldDarkAccentColor: 'Dark accent colour',
    fieldDarkBackgroundColor: 'Dark background colour',
    themeToastSaved: 'Theme colours saved.',
    // landr-sl7k — suggest theme colours from the uploaded logo.
    suggestColorsButton: '✨ Suggest colours',
    suggestColorsButtonLoading: 'Reading logo…',
    suggestColorsAriaLabel: 'Suggest theme colours from your uploaded logo',
    suggestColorsToastApplied:
      'Colours suggested from your logo — review them and Save to lock them in.',
    suggestColorsError:
      "Couldn't read the logo's colours — set them manually.",
    // landr-nils — operator-configurable copy around the embedded booking widget.
    widgetTextSectionTitle: 'Booking widget text',
    widgetTextSectionDesc:
      'Optional text around the widget. Leave a field blank to hide it. Order: logo → headline → description → booking steps → footer.',
    widgetHeadlineLabel: 'Headline',
    widgetHeadlinePlaceholder: 'e.g. Book with us',
    widgetHeadlineHint:
      'Shown above the widget, with or instead of your logo. Empty by default.',
    widgetDescriptionLabel: 'Description',
    widgetDescriptionPlaceholder:
      'e.g. Choose a date and we’ll confirm by email. All bookings are subject to our terms.',
    widgetDescriptionHint:
      'Shown under the headline, above the booking steps. A good place for a short intro or legal note. Line breaks are kept.',
    widgetFooterLabel: 'Footer',
    widgetFooterPlaceholder:
      'e.g. © Your Company · VAT ID · Cancellation policy link',
    widgetFooterHint:
      'Shown below the booking widget. No headline. Line breaks are kept.',
    widgetTextToastSaved: 'Booking widget text saved.',
    // landr-dnzd — first-page-only switch labels + helper line (same for all three).
    widgetFirstPageOnlyLabel: 'Show only on the first page',
    widgetFirstPageOnlyHelper:
      'When on, this only appears on the product-selection screen — not throughout the booking steps.',
    contrastWarningBrand: 'Brand on background contrast is below WCAG AA (4.5:1) — text may be hard to read.',
    contrastWarningAccent: 'Accent button text contrast is below WCAG AA (4.5:1) — button text may be hard to read.',
    brandingPreviewTitle: 'Preview',
    brandingPreviewDesc:
      'Live preview of your widget colours in light and dark mode.',
    brandingPreviewCta: 'Continue',
    brandingPreviewLight: 'Light',
    brandingPreviewDark: 'Dark',
    brandingFileTooLarge: 'File is too large. Max 2 MB.',
    brandingFileTypeUnsupported: 'Only PNG, JPG, SVG, or WebP files are supported.',
    brandingUploadError: 'Failed to upload logo.',
    brandingRemoveError: 'Failed to remove logo.',
    brandingToastUploaded: 'Logo uploaded.',
    brandingToastRemoved: 'Logo removed.',
    brandingDarkLogoUploadError: 'Failed to upload dark logo.',
    brandingDarkLogoRemoveError: 'Failed to remove dark logo.',
    brandingDarkLogoToastUploaded: 'Dark logo uploaded.',
    brandingDarkLogoToastRemoved: 'Dark logo removed.',

    // landr-jb1k — Settings → Booking widget. Operator picks the showcased
    // layout variant, the category grid column count, and the title
    // typography for the embedded booking widget. Card labels are
    // descriptive (no internal codenames); the stored values stay
    // aurora/summit/alpine.
    widgetConfigTitle: 'Booking widget',
    widgetLayoutTitle: 'Layout',
    widgetLayoutDesc:
      'Choose how your booking widget presents products. Change it any time.',
    // Descriptive card labels + subtitles (values: aurora / summit / alpine).
    widgetVariantAuroraLabel: 'Text overlay',
    widgetVariantAuroraDesc: 'Title over the image, rounded corners.',
    widgetVariantSummitLabel: 'Text below image',
    widgetVariantSummitDesc: 'Editorial — image on top, text underneath.',
    widgetVariantAlpineLabel: 'Compact cards',
    widgetVariantAlpineDesc: 'Dense bordered tiles.',
    widgetVariantDefaultHint: "Default — used when you haven't chosen a layout yet.",
    widgetVariantSelected: 'Selected',
    widgetVariantToastSaved: 'Widget layout saved.',
    // Category grid columns.
    widgetColumnsTitle: 'Category columns',
    widgetColumnsDesc:
      'Columns in the category grid on wider screens. Mobile always stacks into one.',
    widgetColumnsLabel: 'Columns',
    widgetColumnsAuto: 'Auto (recommended)',
    widgetColumnsHelper: 'Auto adapts to your category count.',
    widgetColumnsToastSaved: 'Category columns saved.',
    // Title typography.
    widgetTitleStyleTitle: 'Title style',
    widgetTitleStyleDesc:
      'Set the font and letter case for product and category titles in the widget.',
    widgetFontLabel: 'Font',
    widgetFontSystem: 'Standard',
    widgetFontPlayfair: 'Playfair Display — elegant serif',
    widgetFontMontserrat: 'Montserrat — clean geometric',
    widgetFontBebas: 'Bebas Neue — bold display',
    widgetFontSpaceGrotesk: 'Space Grotesk — contemporary',
    widgetFontCaveat: 'Caveat — handwritten',
    widgetFontToastSaved: 'Title font saved.',
    widgetCaseLabel: 'Text case',
    widgetCaseAsEntered: 'As entered',
    widgetCaseUppercase: 'UPPERCASE',
    widgetCaseLowercase: 'lowercase',
    widgetCaseCapitalize: 'Capitalized',
    widgetCasePreviewSample: 'Guided days',
    widgetCaseToastSaved: 'Title case saved.',
    // landr-jb1k.4 — Tile style group: creative category-tile options. Each
    // control has an Auto/default state (= the widget's current behaviour).
    widgetTileStyleTitle: 'Tile style',
    widgetTileStyleDesc:
      'Fine-tune how the category tiles look. Auto keeps the layout’s built-in style.',
    widgetTileAuto: 'Auto',
    // Corner radius.
    widgetTileRadiusLabel: 'Corners',
    widgetTileRadiusSharp: 'Sharp',
    widgetTileRadiusRounded: 'Rounded',
    widgetTileRadiusRound: 'Round',
    widgetTileRadiusToastSaved: 'Tile corners saved.',
    // Aspect ratio.
    widgetTileAspectLabel: 'Shape',
    widgetTileAspectSquare: 'Square (1:1)',
    widgetTileAspectLandscape: 'Landscape (4:3)',
    widgetTileAspectWide: 'Wide (16:9)',
    widgetTileAspectToastSaved: 'Tile shape saved.',
    // Text-overlay scrim.
    widgetTileScrimLabel: 'Overlay tint',
    widgetTileScrimHelper:
      'Applies to the Text overlay layout, where the title sits on the image.',
    widgetTileScrimDark: 'Dark',
    widgetTileScrimBrand: 'Brand',
    widgetTileScrimLight: 'Light',
    widgetTileScrimToastSaved: 'Text overlay saved.',
    // Hover interaction.
    widgetTileHoverLabel: 'Hover effect',
    widgetTileHoverLift: 'Lift',
    widgetTileHoverZoom: 'Zoom',
    widgetTileHoverNone: 'None',
    widgetTileHoverToastSaved: 'Hover effect saved.',
    // Preview-widget external link (opens the live widget with ?preview=1).
    widgetPreviewLinkTitle: 'Preview widget',
    widgetPreviewLinkDesc:
      'See exactly how your widget looks with these settings — opens in a new tab.',
    widgetPreviewLinkButton: 'Preview widget',

    gmailLoading: 'Loading Gmail status…',
    gmailError: 'Failed to load Gmail status.',
    gmailNotConnected: 'Not connected',
    gmailConnect: 'Connect Gmail',
    gmailConnecting: 'Connecting…',
    gmailConnectError: 'Failed to start Gmail connect.',
    gmailConnectedAt: 'Connected:',
    gmailDisconnect: 'Disconnect',
    gmailDisconnecting: 'Disconnecting…',
    gmailDisconnected: 'Gmail disconnected.',
    gmailDisconnectError: 'Failed to disconnect Gmail.',

    // landr-6ybs — Calendar feed subsection.
    calendarFeedTitle: 'Calendar feed',
    calendarFeedDescription:
      'A subscribe URL that pushes every non-cancelled booking into your calendar app. Updates roughly hourly, depending on your calendar client.',
    calendarFeedUrlLabel: 'Subscribe URL',
    calendarFeedLoading: 'Loading feed URL…',
    calendarFeedError: 'Failed to load the feed URL.',
    calendarFeedCopy: 'Copy URL',
    calendarFeedCopied: 'URL copied to clipboard.',
    calendarFeedCopyError: 'Could not copy. Select + copy manually.',
    calendarFeedRegenerate: 'Regenerate URL',
    calendarFeedRegenerating: 'Regenerating…',
    calendarFeedRegenerated:
      'New URL ready. The previous one is now invalid.',
    calendarFeedRegenerateError: 'Failed to regenerate the URL.',
    calendarFeedRegenerateConfirmTitle: 'Regenerate calendar URL?',
    calendarFeedRegenerateConfirmBody:
      'The current URL stops working immediately. Any subscribed calendar app will need re-subscribing with the new URL.',
    calendarFeedRegenerateConfirmCta: 'Regenerate',
    calendarFeedRegenerateCancelCta: 'Cancel',
    calendarFeedInstructionsHeading: 'How to subscribe',
    calendarFeedInstructionsIntro:
      'Copy the URL, then subscribe to it in your calendar app (not import — subscriptions auto-refresh).',
    calendarFeedGoogleHeading: 'Google Calendar',
    calendarFeedGoogleSteps: [
      'Open Google Calendar in a browser (the mobile app cannot add subscriptions; once added on the web it syncs to mobile).',
      'In the left sidebar, click the "+" next to "Other calendars" and choose "From URL".',
      'Paste the URL and click "Add calendar". The feed appears under "Other calendars".',
    ],
    calendarFeedAppleHeading: 'Apple Calendar (macOS / iOS)',
    calendarFeedAppleSteps: [
      'macOS: open Calendar, then File → New Calendar Subscription. Paste the URL and click Subscribe.',
      'iOS: open Settings → Calendar → Accounts → Add Account → Other → Add Subscribed Calendar. Paste the URL.',
      'Choose how often the calendar refreshes; 15 min is the most frequent option.',
    ],
    calendarFeedOutlookHeading: 'Outlook',
    calendarFeedOutlookSteps: [
      'Open Outlook on the web (outlook.live.com or outlook.office.com).',
      'In the calendar view, click "Add calendar" → "Subscribe from web".',
      'Paste the URL, name the calendar, pick a colour, and click Import.',
    ],

    // landr-1nwu.2 — per-operator payment/ERP integration credentials.
    // Secrets are WRITE-ONLY: the API never returns a stored secret, so the
    // UI shows "Configured" + last-updated and a Rotate/Replace input.
    paymentsLoading: 'Loading credentials…',
    paymentsError: 'Failed to load integration credentials.',
    paymentsStripeTitle: 'Stripe',
    paymentsStripeDescription:
      'Your Stripe API keys. Test keys are used everywhere except production; Live keys take real payments.',
    paymentsHoldedTitle: 'Holded',
    paymentsHoldedDescription:
      'Your Holded ERP API key for invoice sync. Demo keys are used outside production; Live takes effect in production.',
    paymentsModeTest: 'Test',
    paymentsModeLive: 'Live',
    paymentsModeDemo: 'Demo',
    paymentsStripePublishableLabel: 'Publishable key',
    // Mode-aware: Stripe live keys are prefixed pk_live_, test keys pk_test_.
    paymentsStripePublishablePlaceholderTest: 'pk_test_…',
    paymentsStripePublishablePlaceholderLive: 'pk_live_…',
    paymentsStripeSecretLabel: 'Secret key',
    paymentsStripeWebhookLabel: 'Webhook signing secret',
    paymentsHoldedApiKeyLabel: 'API key',
    // Shown in place of a stored secret value (which is never returned).
    paymentsConfigured: 'Configured ••••••••',
    // At-a-glance per-mode status so the operator never has to guess whether a
    // mode's credentials are already on file. "Configured" means stored, NOT
    // that the key has been live-verified against Stripe/Holded.
    paymentsModeConfigured: 'Configured',
    paymentsModeNotConfigured: 'Not set up yet',
    paymentsRotate: 'Rotate / replace',
    paymentsRotateCancel: 'Cancel',
    paymentsSecretRotatePlaceholder: 'Enter a new value to replace it',
    paymentsSecretEnterPlaceholder: 'Paste the secret value',
    paymentsLastUpdated: (when: string) => `Last updated ${when}`,
    paymentsSave: 'Save',
    paymentsSaving: 'Saving…',
    paymentsSaved: 'Credentials saved.',
    paymentsSaveError: 'Failed to save credentials.',
    paymentsNothingToSave: 'Nothing to save — enter or rotate a value first.',
    paymentsSecretNeverShown:
      'Saved secrets are never shown again. Enter a new value to rotate one.',
  },
  // landr-atwy — Settings → Account link prompt
  accountLinkSettings: {
    cardTitle: 'App account-link prompt',
    cardDescription:
      'When enabled, customers see a "Track this booking in the LANDR app" prompt after completing a booking. OFF by default.',
    enableLabel: 'Offer "Track in LANDR app" prompt to customers',
    enableHint:
      'Shows a post-booking prompt inviting the customer to link their booking to the LANDR mobile app. Requires magic-link email to be working in production (landr-16u9) before enabling.',
    save: 'Save',
    saving: 'Saving…',
    toastSaved: 'Account-link settings saved.',
    toastError: 'Failed to save account-link settings.',
  },
  // landr-c53m.14 — Settings → Declarations enforcement
  declarationsSettings: {
    cardTitle: 'Declarations enforcement',
    cardDescription:
      'When enabled, customers must accept declarations before completing a booking. OFF by default.',
    enableLabel: 'Require declarations acceptance before booking',
    enableHint:
      'Customers must explicitly accept your declarations (e.g. liability, medical, or safety statements) before a booking is accepted. Applies to bookings that don’t use a custom booking form with its own declaration fields.',
    save: 'Save',
    saving: 'Saving…',
    toastSaved: 'Declarations settings saved.',
    toastError: 'Failed to save declarations settings.',
  },
  // landr-znzz.7 — Settings → Weather
  weatherSettings: {
    cardTitle: 'Conditions forecast hint',
    cardDescription:
      'When enabled, a one-line weather summary is shown next to the conditions chips in the briefing day-card editor. The verdict (Go / Marginal / No-go) is always set manually — weather only informs.',
    enableLabel: 'Enable forecast hint',
    enableHint:
      'Fetch a daily forecast for the configured location and show it as a hint when you set conditions.',
    providerLabel: 'Weather provider',
    latLabel: 'Latitude',
    lonLabel: 'Longitude',
    locationHint:
      'WGS-84 decimal degrees (e.g. 28.9716, -13.5538 for Famara, Lanzarote). Tip: right-click any location in Google Maps and choose "What\'s here?" to get precise coordinates.',
    save: 'Save',
    saving: 'Saving…',
    toastSaved: 'Weather settings saved.',
    toastError: 'Failed to save weather settings.',
    validationLatitude: 'Latitude must be between -90 and 90.',
    validationLongitude: 'Longitude must be between -180 and 180.',
    // Shown in the briefing day-card editor when weather is enabled.
    forecastHintLabel: 'Forecast hint',
    forecastHintLoading: 'Fetching forecast…',
  },
  pickupLocations: {
    title: 'Pickup locations',
    subtitle: 'Manage the sites and sub-points where customers meet you.',
    loading: 'Loading locations…',
    error: 'Failed to load locations.',
    empty: 'No locations yet — add one to get started.',
    addLocation: 'Add location',
    columnName: 'Name',
    columnRoleType: 'Type',
    columnParent: 'Parent site',
    columnEmail: 'Email',
    columnActions: 'Actions',
    actionEdit: 'Edit',
    actionDelete: 'Delete',
    filterPlaceholder: 'Search locations…',
    matches: (n: number, total: number) => `${n} / ${total}`,

    formCreateTitle: 'Add location',
    formEditTitle: 'Edit location',
    formDescription: 'Site-level locations have no parent. Sub-points pick a parent site.',

    fieldName: 'Name',
    fieldRoleType: 'Type',
    fieldParent: 'Parent site (optional)',
    fieldParentNone: '— Site level —',
    fieldRoleTypeNone: '— Select type —',

    errorSubPointDepth: 'Sub-points cannot have their own sub-points.',

    save: 'Save changes',
    saving: 'Saving…',
    create: 'Add location',
    creating: 'Adding…',
    cancel: 'Cancel',

    toastCreated: 'Location added.',
    toastUpdated: 'Location updated.',
    toastDeleted: 'Location deleted.',
    toastError: 'Action failed.',

    deleteDialogTitle: 'Delete location?',
    deleteDialogDescription:
      'This soft-deletes the location. It will disappear from the list immediately. This action can be reversed from the database.',
    deleteDialogConfirm: 'Delete',
    deleteDialogDeleting: 'Deleting…',
    deleteDialogCancel: 'Cancel',
    roleTypesError: 'Failed to load role types.',

    // landr-ogf: type-manager sheet reached via pen icon
    roleTypeManagerTitle: 'Pickup location types',
    roleTypeManagerDescription:
      'Add or rename the types operators can pick for a pickup location (e.g. hotel, port, beach).',
    roleTypeManagerEdit: 'Edit type',
    roleTypeManagerEditAria: (label: string) => `Edit type — ${label}`,
    roleTypeManagerDeleteAria: (label: string) => `Delete type — ${label}`,
    roleTypeManagerEmpty: 'No types yet. Add one below.',
    roleTypeManagerAddTitle: 'Add type',
    roleTypeManagerEditTitle: 'Rename type',
    roleTypeManagerCodeLabel: 'Code',
    roleTypeManagerCodeHint: 'Short identifier (lowercase, hyphenated).',
    roleTypeManagerLabelLabel: 'Label',
    roleTypeManagerSortLabel: 'Sort order',
    roleTypeManagerSave: 'Save',
    roleTypeManagerCancel: 'Cancel',
    roleTypeManagerToastCreated: 'Type added.',
    roleTypeManagerToastUpdated: 'Type updated.',
    roleTypeManagerToastDeleted: 'Type deleted.',
    roleTypeManagerToastError: 'Could not save type.',
    roleTypeManagerEditAffordanceAria: 'Manage pickup location types',
    // landr-cyoi — hotel rows are read-only in the pickup list; they are
    // managed under Settings → Hotels.
    managedUnderHotels: 'Managed under Hotels',
  },
  // landr-cyoi — Hotels as a first-class settings entity (separate from the
  // generic pickup-locations editor). Hotels carry required address/email/
  // phone and an optional Google Maps link; a hotel with no email surfaces a
  // missing-email error so booking confirmations don't silently drop.
  hotels: {
    title: 'Hotels',
    subtitle: 'Manage accommodation partners and their contact details.',
    addHotel: 'Add hotel',
    loading: 'Loading hotels…',
    error: 'Failed to load hotels.',
    empty: 'No hotels yet — add one to get started.',

    columnName: 'Name',
    columnEmail: 'Email',
    columnAddress: 'Address',
    columnPhone: 'Phone',
    columnActions: 'Actions',
    actionEdit: 'Edit',
    actionDelete: 'Delete',
    missingEmail: 'Missing email',

    fieldName: 'Name',
    fieldEmail: 'Booking-confirmation email',
    fieldEmailHint:
      'This address receives booking confirmations sent to the hotel.',
    fieldContactEmail: 'General contact email (optional)',
    fieldContactEmailHint:
      'Public / website contact address — separate from the booking email.',
    fieldAddress: 'Address',
    fieldPhone: 'Phone',
    fieldMapsLink: 'Google Maps link (optional)',
    fieldWebsite: 'Website (optional)',
    fieldCheckinTime: 'Check-in time (optional)',
    fieldCheckoutTime: 'Check-out time (optional)',
    fieldTimezone: 'Hotel timezone (optional)',
    fieldTimezoneHint:
      'IANA timezone used in booking confirmations and calendar events. Leave blank to inherit the operator timezone.',

    formCreateTitle: 'Add hotel',
    formEditTitle: 'Edit hotel',
    formDescription:
      'Hotels appear in the pickup-location list automatically. The booking-confirmation email is required so guests receive their booking details.',

    create: 'Add hotel',
    creating: 'Adding…',
    save: 'Save changes',
    saving: 'Saving…',
    cancel: 'Cancel',

    toastCreated: 'Hotel added.',
    toastUpdated: 'Hotel updated.',
    toastError: 'Action failed.',

    deleteTitle: 'Delete hotel?',
    deleteConfirm: 'Delete',
    deleteWarning:
      'This soft-deletes the hotel. It disappears from the list immediately and stops being offered as a pickup point. This action can be reversed from the database.',
    toastDeleted: 'Hotel deleted.',

    filterPlaceholder: 'Search hotels…',
    matches: (n: number, total: number) => `${n} / ${total}`,

    // Google Places text-search autofill (ENTER-only, top-10 results)
    placesSearchLabel: 'Search on Google',
    placesSearchPlaceholder: 'Type hotel name, then press Enter…',
    placesSearchButton: 'Search',
    placesSearching: 'Searching…',
    placesNoResults: 'No results found.',
    placesNotConfigured: 'Google lookup is not set up yet — fill in fields manually.',
    placesAutofilled: "Fields filled from Google Places — edit anything that doesn't look right.",
    placesError: 'Google lookup failed — fill in fields manually.',
  },
  // landr-funh — delivery roster (Settings → Providers) + per-booking-day
  // assignment picker (BookingDetailSheet).
  providers: {
    title: 'Providers',
    subtitle:
      'The people who deliver your experience — instructors, pilots, drivers. Assign them to booking days from the booking detail.',
    noOperator: 'Select an operator to manage providers.',
    loading: 'Loading providers…',
    error: 'Failed to load providers.',
    empty: 'No providers yet — add one to get started.',
    addProvider: 'Add provider',

    columnName: 'Name',
    columnRole: 'Default role',
    columnStatus: 'Status',
    columnActions: 'Actions',
    statusActive: 'Active',
    statusInactive: 'Inactive',
    roleNone: '—',

    actionEdit: 'Edit',
    actionActivate: 'Activate',
    actionDeactivate: 'Deactivate',
    actionDelete: 'Delete',

    formCreateTitle: 'Add provider',
    formEditTitle: 'Edit provider',
    fieldName: 'Display name',
    fieldNamePlaceholder: 'e.g. Marie Dubois',
    fieldRole: 'Default role',
    fieldRoleNone: '— No default —',

    save: 'Save changes',
    saving: 'Saving…',
    create: 'Add provider',
    creating: 'Adding…',
    cancel: 'Cancel',

    toastCreated: 'Provider added.',
    toastUpdated: 'Provider updated.',
    toastDeleted: 'Provider removed.',
    toastError: 'Action failed.',

    deleteDialogTitle: 'Remove provider?',
    deleteDialogDescription:
      'This soft-deletes the provider from the roster. Existing assignments and revenue history are preserved.',
    deleteDialogConfirm: 'Remove',
    deleteDialogDeleting: 'Removing…',
    deleteDialogCancel: 'Cancel',

    // ---- per-booking-day assignment picker (BookingDetailSheet) ----
    assignSectionTitle: 'Who delivers each day',
    assignSectionHint:
      'Assign a provider to each day of this booking. Days come from the booking line items above.',
    assignLoading: 'Loading assignments…',
    assignError: 'Failed to load assignments.',
    assignNoDays:
      'No scheduled days on this booking yet — add dates above first.',
    assignNoProviders:
      'Your roster is empty. Add providers under Settings → Providers.',
    assignDayLabel: (day: string) => `Day — ${day}`,
    assignProviderPlaceholder: '— Assign a provider —',
    assignAdd: 'Assign',
    assignAdding: 'Assigning…',
    assignRemoveAria: (name: string, day: string) =>
      `Unassign ${name} on ${day}`,
    assignToastAdded: 'Provider assigned.',
    assignToastRemoved: 'Assignment removed.',
    assignToastError: 'Could not update assignment.',
    assignedBadge: (name: string) => name,
  },
  // landr-up1b — nested category tree editor (Settings → Categories).
  categoriesSettings: {
    title: 'Categories',
    subtitle:
      'Organise products into a nested tree. Categories power the booking widget filter and the [landr_booking group="…"] shortcode.',
    noOperator: 'Select an operator to manage categories.',
    loading: 'Loading categories…',
    empty: 'No categories yet — add your first one below.',
    createTitle: 'Add category',
    fieldName: 'Name',
    fieldParent: 'Parent category',
    parentRoot: '— Top level —',
    placeholderName: 'e.g. Courses',
    create: 'Add',
    creating: 'Adding…',
    dupeName: 'A category with this name already exists.',
    rootBadge: 'Top level',
    inactiveBadge: 'Inactive',
    edit: 'Rename',
    save: 'Save',
    saving: 'Saving…',
    cancel: 'Cancel',
    delete: 'Delete',
    deleting: 'Deleting…',
    confirmDelete: 'Confirm delete',
    moveLabel: 'Move under',
    moveAria: (name: string) => `Move category "${name}" under another`,
    copyShortcode: 'Copy shortcode',
    copyShortcodeAria: (name: string) => `Copy widget shortcode for "${name}"`,
    toastCreated: 'Category added.',
    toastUpdated: 'Category updated.',
    toastMoved: 'Category moved.',
    toastDeleted: 'Category deleted.',
    toastError: 'Could not save category.',
    toastReparentCycle: 'Cannot move a category under one of its own sub-categories.',
    toastCopied: 'Shortcode copied!',
  },
  // landr-znzz.5 — generic per-operator offers/upsells editor. No defaults,
  // nothing vendor-specific; each offer links out to the operator's own
  // shop/merch/form via cta_url. No price field.
  offersSettings: {
    title: 'Upsells & offers',
    subtitle:
      'Post-trip add-ons on the customer event page. Each offer links to your shop, merch store, or form — set the link, we show the card.',
    noOperator: 'Select an operator to manage offers.',
    loading: 'Loading offers…',
    empty: 'No offers yet — add your first one below.',
    createTitle: 'Add offer',
    fieldTitle: 'Title',
    fieldDescription: 'Description',
    fieldCtaLabel: 'Button label',
    fieldCtaUrl: 'Button link (your shop / form)',
    fieldImageUrl: 'Image URL',
    fieldActive: 'Show this offer on the event page',
    activeShort: 'Active',
    placeholderTitle: 'e.g. Your flight footage is ready',
    placeholderDescription: 'Tell customers what they get and why.',
    placeholderCtaLabel: 'e.g. Buy your video',
    placeholderCtaUrl: 'https://your-shop.example/…',
    placeholderImageUrl: 'https://…/preview.jpg',
    ctaFallback: 'Open link',
    inactiveBadge: 'Hidden',
    create: 'Add',
    creating: 'Adding…',
    edit: 'Edit offer',
    save: 'Save',
    saving: 'Saving…',
    cancel: 'Cancel',
    delete: 'Delete',
    deleting: 'Deleting…',
    confirmDelete: 'Confirm delete',
    moveUp: 'Move offer up',
    moveDown: 'Move offer down',
    toastCreated: 'Offer added.',
    toastUpdated: 'Offer updated.',
    toastDeleted: 'Offer deleted.',
    toastError: 'Could not save offer.',
  },
  // landr-up1b — booking-widget embed / shortcode generator (Settings → Embed).
  embedSettings: {
    title: 'Embed your booking widget',
    subtitle:
      'Generate the shortcode (or raw iframe) to drop your LANDR booking widget onto any website. Paste the shortcode into WordPress with the LANDR Booking plugin installed.',
    noOperator: 'Select an operator to generate an embed.',
    modeLabel: 'What to show',
    modeAll: 'All products',
    modeCategory: 'A category (and its sub-categories)',
    modeProduct: 'A single product',
    categoryLabel: 'Category',
    categoryPlaceholder: 'Select a category…',
    productLabel: 'Product',
    productPlaceholder: 'Select a product…',
    heightLabel: 'Height (px)',
    heightHint: 'Optional. The iframe height in pixels. Leave blank for the default (800).',
    srcLabel: 'Widget URL override',
    srcHint:
      'Optional. Pin a specific widget origin (e.g. a preview deploy). Leave blank to use the site default.',
    srcPlaceholder: 'https://bw.landr.de/',
    shortcodeLabel: 'Shortcode',
    iframeLabel: 'Raw iframe (non-WordPress sites)',
    copy: 'Copy',
    copied: 'Copied!',
    copyShortcodeAria: 'Copy shortcode',
    copyIframeAria: 'Copy iframe HTML',
    loadingCategories: 'Loading categories…',
    loadingProducts: 'Loading products…',
    noCategories: 'No categories yet — create some under Settings → Categories first.',
    noProducts: 'No products yet — create one under Products.',
    toastCopied: 'Copied to clipboard.',
    toastCopyError: 'Could not copy to clipboard.',
    // landr-7zc5.4 — environment selector + raw URL + open button
    envLabel: 'Environment',
    rawUrlLabel: 'Raw URL',
    copyRawUrlAria: 'Copy raw widget URL',
    openWidgetButton: 'Open booking widget',
  },
  // landr-up1b — per-product copy-shortcode affordance (list row + detail).
  productShortcode: {
    menuLabel: 'Embed shortcode',
    copyProductRow: 'Copy product shortcode',
    copyProductDetail: 'Copy this single product',
    categoryLevelsLabel: 'Copy for a category level',
    copyCategoryLevel: (name: string) => `Copy "${name}"`,
    loading: 'Loading categories…',
    noCategory: 'This product has no category.',
    toastCopied: 'Shortcode copied.',
    toastError: 'Could not copy to clipboard.',
  },
  // landr-71kz.5 — Settings → Forms library CRUD.
  formsSettings: {
    title: 'Forms',
    subtitle:
      'Reusable booking forms with custom fields, validation, and conditional logic. Attach them to products via the Flow tab.',
    noOperator: 'Select an operator to manage forms.',
    loading: 'Loading forms…',
    emptyActive: 'No forms yet — create your first one below.',
    activeTitle: 'Your forms',
    retiredTitle: 'Retired forms',
    retiredBadge: 'Retired',

    createTitle: 'New form',
    fieldName: 'Name',
    fieldKey: 'Key (unique slug)',
    placeholderName: 'e.g. Customer declarations, Age & weight',
    placeholderKey: 'e.g. customer_declarations',
    create: 'Create',
    creating: 'Creating…',
    rename: 'Rename',
    save: 'Save',
    saving: 'Saving…',
    cancel: 'Cancel',
    retire: 'Retire',
    retiring: 'Retiring…',
    confirmRetire: 'Confirm retire',
    restore: 'Restore',
    restoring: 'Restoring…',
    editFields: 'Edit fields',

    dupeKey: 'A form with this key already exists on this operator.',

    toastCreated: 'Form created!',
    toastCreateError: 'Could not create form.',
    toastRenamed: 'Form renamed.',
    toastRenameError: 'Could not rename form.',
    toastRetired: 'Form retired.',
    toastRetireError: 'Could not retire form.',
    toastRestored: 'Form restored.',
    toastRestoreError: 'Could not restore form.',
  },
  // landr-71kz.6 — full field-builder editor (/settings/forms/:id).
  formEditor: {
    crumb: 'Field editor',
    loading: 'Loading form…',
    notFound: 'Form not found.',
    backToLibrary: 'Back to Forms',

    // Left panel
    fieldsPanel: 'Fields',
    noFields: 'No fields yet. Add one below.',
    addField: 'Add field',
    addFieldType: 'Field type',
    addFieldKey: 'Key (immutable)',
    addFieldKeyPlaceholder: 'e.g. body_weight',
    addFieldLabel: 'Label',
    addFieldLabelPlaceholder: 'e.g. Body weight (kg)',
    addFieldCreate: 'Add',
    addFieldCreating: 'Adding…',
    addFieldDupeKey: 'A field with this key already exists on this form.',
    deleteField: 'Delete field',
    deleteFieldConfirm: 'Delete',
    deleteFieldCancel: 'Cancel',
    deletingField: 'Deleting…',

    // Right inspector
    inspectorPlaceholder: 'Select a field on the left to inspect it.',
    sectionType: 'Type',
    sectionKey: 'Key',
    keyImmutableWarning: 'Keys are immutable after first save — answers reference them.',
    sectionLabel: 'Label',
    labelBase: 'Label',
    sectionHelp: 'Help text',
    helpBase: 'Help text',
    sectionRequired: 'Required',
    requiredLabel: 'Required field',
    sectionValidation: 'Validation',
    validationMin: 'Min',
    validationMax: 'Max',
    validationMinLength: 'Min length',
    validationMaxLength: 'Max length',
    validationPattern: 'Pattern (regex)',
    sectionOptions: 'Options',
    optionValue: 'Value',
    optionLabel: 'Label',
    addOption: 'Add option',
    removeOption: 'Remove',
    sectionVisibility: 'Show when',
    visibilityNone: 'Always visible',
    visibilityFieldLabel: 'Field',
    visibilityOpLabel: 'Condition',
    visibilityValueLabel: 'Value',
    visibilityOpEq: 'equals',
    visibilityOpNeq: 'not equals',
    visibilityOpIn: 'is one of (comma-separated)',
    visibilityOpTruthy: 'is checked / non-empty',
    save: 'Save',
    saving: 'Saving…',
    toastSaved: 'Field saved.',
    toastSaveError: 'Could not save field.',
    toastDeleted: 'Field deleted.',
    toastDeleteError: 'Could not delete field.',
    toastReordered: 'Fields reordered.',
    toastReorderError: 'Could not save new order.',

    // Live preview pane
    previewTitle: 'Preview',
    previewEmpty: 'Add a field to see a preview.',
    previewRequired: '(required)',
    previewPlaceholderText: 'Enter text…',
    previewPlaceholderNumber: 'Enter number…',
    previewPlaceholderSelect: 'Choose an option…',
    previewPlaceholderLanguage: 'Select language…',
    previewCheckboxLabel: 'Check this box',
  },
  // landr-iz58 — operator-scoped tag CRUD (Settings → Tags).
  tagsSettings: {
    title: 'Tags',
    subtitle:
      'Colour-coded labels for bookings and contacts — great for slicing and filtering.',
    noOperator: 'Select an operator to manage tags.',
    loading: 'Loading tags…',
    empty: 'No tags yet — create one above.',

    createTitle: 'New tag',
    existingTitle: 'Your tags',
    placeholderName: 'e.g. VIP, Returning, Hen party',
    fieldName: 'Name',
    fieldColor: 'Color',
    create: 'Create',
    creating: 'Creating…',
    edit: 'Edit',
    save: 'Save',
    saving: 'Saving…',
    cancel: 'Cancel',
    delete: 'Delete',
    deleting: 'Deleting…',
    confirmDelete: 'Confirm delete',
    dupeName: 'A tag with this name already exists on this operator.',

    toastCreated: 'Tag created.',
    toastCreateError: 'Could not create tag.',
    toastUpdated: 'Tag updated.',
    toastUpdateError: 'Could not update tag.',
    toastDeleted: 'Tag deleted.',
    toastDeleteError: 'Could not delete tag.',
  },
  // landr-1tqx — Settings → Service roles. Operator-scoped catalogue of
  // participant roles (Pilot/Passenger/Diver…) the booking widget reads.
  serviceRolesSettings: {
    title: 'Service roles',
    subtitle:
      'Participant roles customers choose at booking. Every operator starts with one; add, rename, reorder, or deactivate as needed.',
    noOperator: 'Select an operator to manage service roles.',
    loading: 'Loading service roles…',
    empty: 'No service roles yet — add one above.',

    createTitle: 'New service role',
    existingTitle: 'Your service roles',
    placeholderLabel: 'e.g. Pilot, Passenger, Diver',
    fieldLabel: 'Label',
    fieldCode: 'Code',
    codeHint: 'Auto-generated from the label. Used internally; not editable later.',
    // landr-m63x — mobile-parity toggles (previously typed but unsurfaced).
    fieldReceivesMainService: 'Receives main service',
    receivesMainServiceHint:
      'This role performs the core service being booked (e.g. the tandem passenger on a tandem flight). Turn off for incidental participants who just come along.',
    fieldRequiresPickupLocation: 'Requires pickup location',
    requiresPickupLocationHint:
      'Ask for a pickup point when booking this role (e.g. shuttle collection). Turn off for participants arriving by their own means.',
    create: 'Add',
    creating: 'Adding…',
    edit: 'Edit',
    save: 'Save',
    saving: 'Saving…',
    cancel: 'Cancel',
    delete: 'Delete',
    deleting: 'Deleting…',
    confirmDelete: 'Confirm delete',
    activate: 'Activate',
    deactivate: 'Deactivate',
    moveUp: 'Move up',
    moveDown: 'Move down',
    inactiveBadge: 'Inactive',
    codeBadge: (code: string) => `(${code})`,

    dupeCode: 'A service role with this code already exists. Try a different label.',
    lastActiveRole:
      'At least one active service role is required for the booking form to work.',

    toastCreated: 'Service role added.',
    toastCreateError: 'Could not add service role.',
    toastUpdated: 'Service role updated.',
    toastUpdateError: 'Could not update service role.',
    toastDeleted: 'Service role deleted.',
    toastDeleteError: 'Could not delete service role.',
    toastReorderError: 'Could not reorder.',
  },
  // landr-sp4r — Settings → Campaigns. Operator-scoped marketing
  // campaigns + codes used for booking attribution (bookings.campaign_id).
  campaignsSettings: {
    title: 'Campaigns',
    subtitle:
      'Marketing campaigns, each with a unique code. Track which channel drove each booking.',
    noOperator: 'Select an operator to manage campaigns.',
    loading: 'Loading campaigns…',
    empty: 'No campaigns yet — create one to start tracking bookings.',
    errorTitle: 'Could not load campaigns.',

    newButton: 'New campaign',
    existingTitle: 'Your campaigns',

    // dialog
    createTitle: 'New campaign',
    editTitle: 'Edit campaign',
    dialogDescription:
      'Code must be unique per operator. Inactive campaigns stay attributable but are hidden from new pickers.',

    fieldCode: 'Code',
    fieldCodeHint: 'Short, unique identifier (e.g. SUMMER25).',
    fieldLabel: 'Label',
    fieldKind: 'Kind',
    fieldScope: 'Scope',
    fieldDescription: 'Description',
    fieldStartDate: 'Start date',
    fieldEndDate: 'End date',
    fieldEndDateHint: 'Leave blank for an open-ended campaign.',
    placeholderCode: 'e.g. SUMMER25',
    placeholderLabel: 'e.g. Summer 2025 push',
    placeholderDescription: 'Optional internal note.',

    scopeBooking: 'Booking',
    scopeSubscription: 'Subscription',
    scopeAny: 'Any',

    fieldActive: 'Active',

    statusActive: 'Active',
    statusInactive: 'Inactive',

    save: 'Save',
    saving: 'Saving…',
    create: 'Create',
    creating: 'Creating…',
    cancel: 'Cancel',
    edit: 'Edit',
    deactivate: 'Deactivate',
    deactivating: 'Deactivating…',
    confirmDeactivate: 'Confirm deactivate',

    dateWindowError: 'End date must not be before the start date.',

    toastCreated: 'Campaign created.',
    toastCreateError: 'Could not create campaign.',
    toastUpdated: 'Campaign updated.',
    toastUpdateError: 'Could not update campaign.',
    toastDeactivated: 'Campaign deactivated.',
    toastDeactivateError: 'Could not deactivate campaign.',
  },
  // landr-v198 — Settings → Vouchers. Operator-scoped promo-code editor
  // over the vouchers table (create/edit/list/deactivate). Distinct from
  // the read-only voucher-performance card on /analytics.
  vouchersSettings: {
    title: 'Vouchers',
    subtitle:
      'Discount codes customers redeem at checkout — percent or flat off, with optional usage caps and an expiry window.',
    noOperator: 'Select an operator to manage vouchers.',
    loading: 'Loading vouchers…',
    empty: 'No vouchers yet — create one to start rewarding customers.',

    newVoucher: 'New voucher',

    colCode: 'Code',
    colKind: 'Type',
    colAmount: 'Amount',
    colUsage: 'Used',
    colWindow: 'Valid',
    colActive: 'Status',

    kindPercent: 'Percentage',
    kindFlat: 'Flat amount',

    statusActive: 'Active',
    statusInactive: 'Inactive',

    windowAlways: 'Always',
    windowFrom: 'From',
    windowUntil: 'Until',

    scopes: {
      booking: 'Bookings',
      subscription: 'Subscriptions',
      any: 'Any',
    },

    dialogCreateTitle: 'New voucher',
    dialogEditTitle: 'Edit voucher',
    dialogDescription:
      'Codes are stored upper-cased. Customers enter them at checkout.',

    fieldCode: 'Code',
    fieldKind: 'Type',
    fieldAmount: 'Amount',
    fieldScope: 'Applies to',
    fieldMaxUses: 'Max uses',
    fieldValidFrom: 'Valid from',
    fieldValidUntil: 'Valid until',
    // landr-c53m.5 — product/campaign scope pickers (landr-u3jr added the
    // API fields). Distinct from `fieldScope` above (booking/subscription/
    // any) — that's the redemption context, these are FK references.
    fieldProductScope: 'Limit to product',
    fieldCampaignScope: 'Attribute to campaign',
    fieldDescription: 'Description',
    fieldActive: 'Active (customers can redeem this code)',

    maxUsesHint: 'Leave blank for unlimited.',
    placeholderCode: 'e.g. SUMMER25',
    placeholderUnlimited: 'Unlimited',
    placeholderAllProducts: 'All products',
    placeholderNoCampaign: 'No campaign',
    placeholderDescription: 'Internal note (optional)',

    create: 'Create',
    save: 'Save',
    saving: 'Saving…',
    edit: 'Edit',
    cancel: 'Cancel',
    deactivate: 'Deactivate',
    deactivating: 'Deactivating…',
    confirmDeactivate: 'Confirm',

    toastCreated: 'Voucher created.',
    toastCreateError: 'Could not create voucher.',
    toastUpdated: 'Voucher updated.',
    toastUpdateError: 'Could not update voucher.',
    toastDeactivated: 'Voucher deactivated.',
    toastDeactivateError: 'Could not deactivate voucher.',
  },
  // landr-r87i — Settings → Operations. v2 of landr-84n1: operators
  // curate the DEFAULT per-booking checklist items (saved server-side
  // in operator_checklist_templates). Per-booking done flags + custom
  // items continue to live in dashboard localStorage.
  operationsSettings: {
    title: 'Operations',
    subtitle:
      'Default checklist items seeded into every new booking. Per-booking progress and custom items live on-device.',
    noOperator: 'Select an operator to manage the checklist template.',
    loading: 'Loading template…',
    error: 'Failed to load checklist template.',

    sectionChecklist: 'Default booking checklist',
    sectionChecklistDesc:
      'Add, rename, reorder, or remove the items every new booking starts with.',

    empty: 'No default items yet — add one below, or save empty for fully custom checklists per booking.',

    addAction: 'Add item',
    addAria: 'Add a new default checklist item',
    removeAria: (label: string) => `Remove "${label}"`,
    moveUpAria: (label: string) => `Move "${label}" up`,
    moveDownAria: (label: string) => `Move "${label}" down`,
    labelAria: (idx: number) => `Item ${idx + 1} label`,
    save: 'Save changes',
    saving: 'Saving…',
    revert: 'Discard',

    toastSaved: 'Checklist template saved.',
    toastSaveError: 'Could not save the checklist template.',
    duplicateLabelError: 'Each item must have a unique label.',
    emptyLabelError: 'Item labels cannot be blank.',
  },
  // landr-qg4q — Settings → Email log. Read-only viewer over the
  // public.outbound_emails queue so operators can debug why a customer
  // didn't get an email without reaching for Supabase Studio.
  emailLog: {
    title: 'Email log',
    subtitle:
      'The outbound email queue. Click a row to inspect the full body and any sender error.',
    noOperator: 'Select an operator to view the email log.',
    loading: 'Loading email log…',
    error: 'Failed to load the email log.',
    empty: 'No outbound emails match the current filters.',

    filtersLabel: 'Filter by status',
    typeFiltersLabel: 'Filter by type',
    clearFilters: 'Clear filters',
    fromLabel: 'From',
    toLabel: 'To',

    columnSubject: 'Subject',
    columnRecipient: 'Recipient',
    columnType: 'Type',
    columnStatus: 'Status',
    columnSentAt: 'Sent at',
    columnCreatedAt: 'Queued at',

    typeLabels: {
      booking_confirmation: 'Confirmation',
      booking_received: 'Booking received',
      group_inquiry: 'Group inquiry',
      account_link: 'Account link',
    } as Record<string, string>,

    rowAriaLabel: (subject: string): string =>
      `Open email log entry: ${subject}`,

    statusLabels: {
      queued: 'Queued',
      sending: 'Sending',
      sent: 'Sent',
      failed: 'Failed',
    } as Record<string, string>,

    drawerHeader: (recipient: string, kind: string, locale: string): string =>
      `${recipient} · ${kind} · ${locale}`,

    fieldStatus: 'Status',
    fieldRetries: 'Retries',
    fieldLastError: 'Last sender error',
    fieldBodyHtml: 'HTML body',
    fieldBodyHtmlTitle: 'Email HTML body (sandboxed preview)',
    fieldBodyText: 'Plain-text body',

    // sent_via badge labels
    badgeCapturedDev: 'Captured (dev)',
    drawerDevFallbackNote:
      'This email was captured locally — no Gmail account is connected yet.',
    drawerDevFallbackLink: 'Connect Gmail',
    drawerResentFromNote: (id: string): string => `Resent from ${id}`,

    // Resend dialog
    resendButton: 'Resend',
    resendDialogTitle: 'Resend email',
    resendDialogDescription:
      'Edit any fields below before resending. Only changed fields are sent.',
    resendFieldTo: 'To',
    resendFieldSubject: 'Subject',
    resendFieldBody: 'Body',
    resendFieldBodyText: 'Plain-text body',
    resendHtmlToggle: 'Edit HTML source',
    resendSubmit: 'Send',
    resendCancel: 'Cancel',
    resendToastSuccess: 'Email queued for resend.',
    resendToastError: 'Resend failed.',
    // Rich-text editor (landr-ri8a)
    rteAriaLabel: 'Email body editor',
    rteHeading1: 'Heading 1',
    rteHeading2: 'Heading 2',
    rteBold: 'Bold',
    rteItalic: 'Italic',
    rteBulletList: 'Bullet list',
    rteOrderedList: 'Numbered list',
    rteLink: 'Link',
    rteLinkPrompt: 'Enter URL',
  },
  reporting: {
    title: 'Reporting',
    loading: 'Loading bookings…',
    error: 'Failed to load reporting data.',
    empty: 'No bookings in the selected range.',

    kpiBookingsLabel: 'Bookings',
    kpiBookingsHint: 'Total bookings (incl. cancelled)',
    kpiRevenueLabel: 'Revenue',
    kpiRevenueHint: 'Excludes cancelled bookings',
    kpiAvgTicketLabel: 'Average ticket',
    kpiAvgTicketHint: 'Revenue ÷ non-cancelled bookings',

    rangeLabel: 'Date range',
    rangeFromLabel: 'From',
    rangeToLabel: 'To',
    rangeAllTime: 'All time',
    rangeLast30: 'Last 30 days',
    rangeLast90: 'Last 90 days',
    rangeThisYear: 'This year',

    chartRevenueTitle: 'Revenue over time',
    chartRevenueDescription:
      'Daily gross revenue, cancelled bookings excluded.',
    chartBookingsTitle: 'Bookings per week',
    chartBookingsDescription:
      'ISO-8601 weeks, bucketed by earliest scheduled date.',

    exportCsv: 'Export CSV',
    exportRowsLabel: (n: number) => `${n} row${n === 1 ? '' : 's'}`,

    cancelledNote: (n: number) =>
      n === 0
        ? ''
        : `${n} cancelled booking${n === 1 ? '' : 's'} excluded from revenue.`,
    mixedCurrencyWarning:
      'Multiple currencies detected — totals shown in the first currency seen.',

    holdedSyncTitle: 'Holded sync',
    holdedSyncBody:
      'Holded sync runs automatically after the Para42 cancellation period. ' +
      'A manual "sync now" trigger from this screen is deferred until the ' +
      'matching FastAPI endpoint ships (landr-m05.9 carry-over).',
  },
  // landr-af6c — /analytics route copy. Lives next to the reporting bucket
  // because both surfaces consume the same bookings fetch; analytics is the
  // operational-insight view while reporting is the export-and-numbers view.
  analytics: {
    title: 'Analytics',
    loading: 'Loading analytics…',
    error: 'Failed to load analytics data.',
    empty: 'No bookings in the selected range yet.',

    rangeLabel: 'Range',
    rangeLast30: 'Last 30 days',
    rangeLast90: 'Last 90 days',
    rangeLast365: 'Last 365 days',
    rangeNote: (from: string, to: string) => `${from} → ${to}`,

    kpiBookingsLabel: 'Bookings',
    kpiBookingsHint: 'Total bookings (incl. cancelled)',
    kpiRevenueLabel: 'Revenue',
    kpiRevenueHint: 'Excludes cancelled bookings',
    kpiAvgTicketLabel: 'Average ticket',
    kpiAvgTicketHint: 'Revenue ÷ non-cancelled bookings',

    cancelledNote: (n: number) =>
      n === 0
        ? ''
        : `${n} cancelled booking${n === 1 ? '' : 's'} excluded from revenue.`,
    mixedCurrencyWarning:
      'Multiple currencies detected — totals shown in the first currency seen.',

    revenueOverTimeTitle: 'Revenue over time',
    revenueOverTimeDescription:
      'Gross revenue per bucket, cancelled bookings excluded.',
    bucketDay: 'daily buckets',
    bucketWeek: 'weekly buckets',
    bucketMonth: 'monthly buckets',

    productsTitle: 'Bookings per product',
    productsDescription:
      'Top 10 products by booking line count. Multi-product bookings ' +
      'allocate revenue evenly across their lines.',

    funnelTitle: 'Conversion funnel',
    funnelDescription:
      'Initiated → confirmed → completed. Each stage contains its successors.',
    funnelInitiated: 'Initiated',
    funnelConfirmed: 'Confirmed',
    funnelCompleted: 'Completed',
    funnelFromTop: (pct: string) => `${pct} of top`,
    funnelFromPrev: (pct: string) => `${pct} of previous`,
    funnelCancelledNote: (n: number) =>
      `${n} cancelled booking${n === 1 ? '' : 's'} dropped off before confirmation.`,
    funnelNoShowNote: (n: number) =>
      `${n} no-show booking${n === 1 ? '' : 's'} confirmed but never arrived.`,

    topCustomersTitle: 'Top customers',
    topCustomersDescription: 'By revenue, then booking count. Up to 10 rows.',
    topCustomersColumnName: 'Customer',
    topCustomersColumnEmail: 'Email',
    topCustomersColumnBookings: 'Bookings',
    topCustomersColumnRevenue: 'Revenue',
    topCustomersEmpty: 'No customers in the selected range.',

    heatmapTitle: 'Occupancy heatmap',
    heatmapDescription:
      'When bookings come in. Rows are weekdays of the service date; ' +
      'columns are the booking-creation hour (UTC).',
    heatmapEmpty: 'No bookings in the selected range to plot.',
    heatmapHourAxis: 'Hour of day (UTC)',
    heatmapCellAria: (count: number, weekday: string, hour: number) =>
      `${count} booking${count === 1 ? '' : 's'} on ${weekday} at ${hour.toString().padStart(2, '0')}:00 UTC`,

    // landr-ce45 — revenue per staff card. Attributes booking revenue via
    // booking_day_provider_assignments; multi-provider days split evenly.
    perStaffTitle: 'Revenue per staff',
    perStaffDescription:
      'Booking revenue attributed via per-day provider assignments. ' +
      'When multiple providers work the same day, revenue is split evenly.',
    perStaffColumnName: 'Staff',
    perStaffColumnBookings: 'Bookings',
    perStaffColumnRevenue: 'Revenue',
    perStaffColumnAverage: 'Avg / booking',
    perStaffEmpty:
      'No provider assignments in the selected range yet.',

    // landr-1jgr — voucher performance card. Counts bookings with
    // voucher_id_applied per voucher; discount totals are approximated
    // from voucher metadata (no per-redemption persisted discount column
    // today — see lib/analytics.shapeVoucherPerformance for the formula).
    voucherPerformanceTitle: 'Voucher performance',
    voucherPerformanceDescription:
      'Top vouchers by redemption count. Discount totals are approximated ' +
      'from voucher kind + amount; cancelled bookings contribute 0.',
    voucherPerformanceColumnCode: 'Code',
    voucherPerformanceColumnKind: 'Kind',
    voucherPerformanceColumnRedemptions: 'Redemptions',
    voucherPerformanceColumnDiscount: 'Discount given',
    voucherPerformanceEmpty:
      'No voucher redemptions in the selected range.',
    voucherKindPercent: 'Percent',
    voucherKindFlat: 'Flat',
    voucherKindUnknown: 'Unknown',
  },
  emailTemplates: {
    title: 'Email templates',
    subtitle: 'Customise the transactional emails sent to customers for each booking event.',
    loading: 'Loading email templates…',
    error: 'Failed to load email templates.',
    // landr-x5o5.4: badge labels — is_default from the effective endpoint drives which one shows.
    statusCustom: 'Customized',
    statusDefault: 'Using Landr default',
    // landr-x5o5.4: toast when saving identical content against the default (no-op).
    toastNoChangeFromDefault: 'No changes from the default — nothing saved.',
    selectorKindLabel: 'Template',
    selectorLocaleLabel: 'Language',
    // landr-x5o5.7: shown instead of the locale switcher for hotel-facing kinds.
    // Reads hotel_email_locale (falls back to default_locale, then the
    // neutral 'en' default — landr-c53m.7).
    hotelLocalePinNote: (locale: string): string =>
      `Hotel emails are always sent in ${locale.toUpperCase()}. Hotel language is set in operator settings.`,

    kindLabels: {
      booking_received: 'Booking received',
      hotel_request: 'Hotel request',
      hotel_confirmation: 'Hotel confirmation',
      booking_confirmation: 'Booking confirmation',
    } as Record<string, string>,

    localeLabels: {
      de: 'German (de)',
      en: 'English (en)',
      es: 'Spanish (es)',
    } as Record<string, string>,

    fieldSubject: 'Subject',
    fieldSubjectPlaceholder: 'e.g. Your booking is confirmed',
    fieldBodyHtml: 'HTML body',
    fieldBodyHtmlPlaceholder: '<p>Hello {{customer_name}},</p>',
    fieldBodyText: 'Plain-text body',
    fieldBodyTextPlaceholder: 'Hello {{customer_name}},\n\nYour booking is confirmed.',
    optional: 'optional',

    formAriaLabel: 'Email template editor',

    save: 'Save',
    saving: 'Saving…',
    resetToDefault: 'Reset to default',
    resetting: 'Resetting…',

    toastSaved: 'Template saved.',
    toastSaveError: 'Failed to save template',
    toastReset: 'Template reset to built-in default.',
    toastResetError: 'Failed to reset template',

    previewTitle: 'Preview',
    previewLoading: 'Loading preview…',
    previewError: 'Preview failed',
    previewSelectTemplate: 'Save a template to see the preview.',
    previewSubject: 'Subject',
    previewHtml: 'HTML',
    previewHtmlTitle: 'Email HTML preview',
    previewText: 'Plain text',
    // landr-7tyo — Jinja render error surfaced from the preview endpoint
    // (landr-tq6j). Banner sits below the iframe so the operator can
    // still see whatever partial output the engine produced before the
    // failure.
    previewRenderErrorTitle: 'Template did not render',
    previewRenderErrorHint:
      'This template references a variable that the email engine does not provide. Pick a name from the catalog on the right.',
    // landr-7tyo — variable catalog sidebar (C2 from email-templates.md).
    // Surfaced from the preview endpoint's fixture.context payload so
    // the dashboard always shows the same keys the renderer accepts.
    variablesTitle: 'Available variables',
    variablesHint:
      'Click a chip to copy the Jinja placeholder. Paste into the subject or body to inject the value at send time.',
    variablesEmpty: 'No variables available for this template type.',
    variablesCopyAria: (key: string): string => `Copy {{ ${key} }} to clipboard`,
    variablesCopied: 'Copied to clipboard.',
    variablesCopyError: 'Could not copy to clipboard.',
    variablesSampleLabel: 'Sample',
  },
  onboarding: {
    title: 'Welcome to LANDR',
    progress: (current: number, total: number) => `Step ${current} of ${total}`,
    // Energetic resume copy — shown when the user isn't on step 1 (Onboarding.tsx
    // resumeLabel). `pct` is the caller-computed completion percentage.
    resume: (current: number, total: number, pct: number) => {
      if (pct >= 80) return `Step ${current} of ${total} — almost there! 🚀`
      if (pct >= 50) return `Step ${current} of ${total} — you're on a roll! ⚡`
      return `Step ${current} of ${total}`
    },
    next: 'Next',
    back: 'Back',
    skip: 'Skip for now',
    saving: 'Saving…',
    saveError: 'Could not save your changes. Try again.',
    rerunLink: 'Re-run setup',

    step1: {
      heading: 'Welcome to LANDR!',
      body:
        'LANDR is the booking platform you use to take, confirm and run reservations for your activities. ' +
        'This quick setup walks you through the essentials so you can start taking bookings today.',
      cta: 'Let\'s go!',
    },
    step2: {
      heading: 'Your company',
      body: 'How your business shows up to customers and on invoices.',
    },
    step3: {
      heading: 'Address & contact',
      body: 'Used on invoices, customer emails, and the booking widget.',
    },
    step4: {
      heading: 'Pickup locations',
      body:
        'Where do you pick customers up? Add at least one spot so the booking widget can offer it ' +
        '(hotels, meeting points, harbour, etc.). You can always add more later.',
      count: (n: number) =>
        n === 0
          ? 'No pickup locations yet.'
          : `${n} pickup location${n === 1 ? '' : 's'} configured.`,
      manage: 'Open pickup locations',
      skipWarning:
        'You have no pickup locations yet — customers will not see any pickup options. Skip anyway?',
    },
    step5: {
      heading: 'Your first products',
      body:
        'Products are the activities customers can book. Start with a template — you can fine-tune ' +
        'prices, durations and details later from the Products page.',
      templateGuided: 'Guided day',
      templateGuidedDesc: 'Single-day guided activity. Time-slot bookable, needs a guide.',
      templateCourse: 'Course (multi-day)',
      templateCourseDesc: 'Multi-day course over a fixed date range.',
      templateHotel: 'Hotel package',
      templateHotelDesc: 'Day activity bundled with hotel pickup. Needs hotel coordination.',
      templateTandem: 'Tandem flight',
      templateTandemDesc: 'Single tandem flight, time-slot bookable with a pilot.',
      create: 'Create',
      creating: 'Creating…',
      created: (name: string) => `Created '${name}'.`,
      createError: 'Could not create product. Open Products to add manually.',
      manage: 'Open products',
      count: (n: number) =>
        n === 0 ? 'No products yet.' : `${n} product${n === 1 ? '' : 's'} configured.`,
    },
    step6: {
      heading: 'Connect your Gmail',
      body:
        'Send booking emails from YOUR Gmail address — not a faceless no-reply. Customers see ' +
        'emails from a real person at your company, which dramatically improves deliverability ' +
        'and replies. Free to set up; takes about a minute.',
      connect: 'Connect Gmail',
      connecting: 'Connecting…',
      connectedAs: (email: string) => `Connected as ${email}`,
      reconnect: 'Reconnect',
      connectError: 'Could not start Gmail connect.',
      loading: 'Checking Gmail status…',
    },
    step7: {
      heading: 'Email templates',
      body:
        'LANDR comes with sensible default templates for the three customer-facing emails. ' +
        'Head to Email templates if you want to tweak the wording — otherwise the defaults are great to go with.',
      defaultKinds: 'Booking received · Hotel request · Booking confirmation',
      manage: 'Open email templates',
    },
    step8: {
      heading: 'Embed the booking widget',
      body:
        'Paste this WordPress shortcode anywhere on your site to show the booking widget. ' +
        'It reads your products, pickup locations and prices automatically — nothing to configure.',
      copy: 'Copy',
      copied: 'Copied!',
      loading: 'Generating your embed code…',
      tokenError: 'Couldn\'t load your embed code — open Settings → Embed to copy it.',
      filterHint:
        'Want to embed only a specific category or product? Generate filtered snippets any time under Settings → Embed.',
      done: 'I\'ve embedded it',
    },
    step9: {
      heading: 'You\'re ready to take bookings!',
      body:
        'Setup complete. The dashboard is your home base for managing reservations, ' +
        'the calendar, and customer contacts.',
      ctaDashboard: 'Open dashboard',
      ctaBookings: 'See bookings',
      ctaCalendar: 'Open calendar',
    },

    steps: {
      welcome: 'Welcome',
      company: 'Company',
      address: 'Address',
      pickup: 'Pickup',
      products: 'Products',
      gmail: 'Gmail',
      emails: 'Emails',
      embed: 'Embed',
      done: 'Done',
    },

    banner: {
      title: 'Finish setting up your account',
      body: 'Complete the 9-step setup to start taking bookings.',
      resume: 'Resume',
      dismiss: 'Dismiss',
    },
  },

  // landr-y5si — config-health banners: operator misconfiguration warnings
  // rendered at the top of the main dashboard layout.
  configHealth: {
    dismiss: 'Dismiss',
    goToSetting: 'Fix',
  },
  schedule: {
    title: 'Schedule',
    description:
      'Set bookable days for each product. Extend the default availability, block holidays, or tweak capacity per day.',
    productLabel: 'Product',
    productPlaceholder: 'Select a product…',
    noProducts: 'No products yet — create one in Products first.',
    loading: 'Loading availability…',
    error: 'Failed to load availability.',
    rangeHint:
      'Showing the current month. Drag-select a range or click a single day.',
    addButton: 'Add availability',

    dayClosed: 'Closed',
    dayUnscheduled: 'Not scheduled',

    formTitle: 'Add availability',
    formNoProduct: 'Pick a product first.',
    formFromLabel: 'From',
    formToLabel: 'To (inclusive)',
    formCapacityLabel: 'Capacity',
    formCapacityHint: 'Set 0 to mark the days as Closed.',
    formNotesLabel: 'Notes (optional)',
    formSlotsLabel: 'Time slots',
    formSlotAdd: 'Add slot',
    formSlotRemove: 'Remove',
    formSlotStartLabel: 'Start',
    formSlotEndLabel: 'End',
    formCancel: 'Cancel',
    formSubmit: 'Save',
    formSaving: 'Saving…',
    formDatesRequired: 'From and To dates are required.',
    formRangeInverted: 'To must be on or after From.',
    formCapacityInvalid: 'Capacity must be a non-negative integer.',
    formSlotInvalid: 'Slot times must be HH:MM.',
    formSlotInverted: 'Slot end time must be after start time.',

    popoverTitle: 'Edit day',
    popoverDelete: 'Delete',
    popoverBlock: 'Block (capacity 0)',
    popoverSave: 'Save',
    popoverReservedHint: (reserved: number, capacity: number) =>
      `${reserved} of ${capacity} reserved.`,
    popoverMultiSlotsHint: (count: number) =>
      `${count} time slots on this day. Editing the first; manage others via bulk add.`,

    toastBulkSuccess: (n: number) => `Added ${n} availability rows.`,
    toastBulkError: 'Failed to add availability.',
    toastSaveSuccess: 'Availability updated.',
    toastSaveError: 'Failed to update availability.',
    toastDeleteSuccess: 'Availability removed.',
    toastDeleteError: 'Failed to remove availability.',

    // landr-lp9t — Month/List view toggle + List view chrome.
    viewToggleMonth: 'Month',
    viewToggleList: 'List',
    viewToggleLabel: 'View',
    listEmpty: 'No availability in this window yet — add some above.',
    listOneDay: '1 day',
    listDayCount: (n: number) => `${n} days`,
    listSeatsPerDay: (n: number) => `${n} seats/day`,
    listReservedHint: (reserved: number, total: number) =>
      `${reserved}/${total} reserved`,
  },

  // landr-v0xg — saved Views index page (empty-state with templates,
  // 'pick a view' helper text, '+ New view' affordance). Phase 6
  // (landr-c58d) will add starring/hiding controls; phase 2 (landr-hgtv)
  // adds the per-view ViewPage chrome.
  viewsIndex: {
    title: 'Views',
    newButton: '+ New view',
    templateSectionTitle: 'Start from a template',
  },
  // landr-ne58 — Recently-viewed section in the app sidebar (last 5
  // detail surfaces the operator opened — bookings, contacts, products,
  // views).
  recentlyViewed: {
    heading: 'Recently viewed',
    collapse: 'Collapse Recently viewed',
    expand: 'Expand Recently viewed',
    empty: "Open a booking, contact, or product — it'll show up here.",
    typeBooking: 'Booking',
    typeContact: 'Contact',
    typeProduct: 'Product',
    typeView: 'View',
  },
  // landr-c58d / landr-45pb / landr-79f5 — Views sub-list in the app sidebar.
  // landr-79f5 simplifies the IA: pinned-only sidebar (no More / Hidden buckets).
  // Pin = appears in sidebar; Unpin = does not. The `hidden` schema column
  // still exists but is a no-op in the sidebar (treated as "not visible").
  viewsSidebar: {
    pinView: 'Pin this view',
    unpinView: 'Unpin this view',
    emptyHintLinkLabel: '/views',
    newViewButton: '+ New view',
    pinError: 'Failed to update pin.',
    reorderError: 'Failed to reorder views.',
  },
  // landr-hgtv — per-view ViewPage chrome (toolbar, layout switcher,
  // filter chips, dirty-state save UX). Layout body strings only describe
  // the placeholder; the real layouts (D Table, E Board, F Calendar) ship
  // their own copy in landr-7w3s / landr-kjls / landr-9kbl.
  views: {
    rename: 'Rename view',
    renameSave: 'Save name',
    renameCancel: 'Cancel',
    setDefaultLayout: 'Set as default layout',
    duplicate: 'Duplicate',
    duplicating: 'Duplicating…',
    duplicateError: 'Could not duplicate view.',
    delete: 'Delete view',
    deleting: 'Deleting…',
    deleteConfirm: "Delete this view? It's gone for good.",
    deleteError: 'Could not delete view.',
    notFoundTitle: 'View not found',
    loadError: 'Could not load view.',
    loading: 'Loading view…',
    unsavedTitle: 'Unsaved changes',
    unsavedBody: 'Save or discard your changes before leaving.',
    save: 'Save',
    saving: 'Saving…',
    discard: 'Discard',
    saved: 'Saved',
    saveError: 'Save failed',
    leaveConfirm: 'Unsaved changes will be lost — leave anyway?',
    layout: {
      groupLabel: 'View layout',
      table: 'Table',
      board: 'Board',
      calendar: 'Calendar',
    },
    toolbar: {
      sortLabel: 'Sort:',
      sortNone: 'No sort',
      sortAsc: 'Ascending',
      sortDesc: 'Descending',
      columns: 'Columns',
      columnsPlaceholderTip: 'Column picker arrives with the Table layout.',
      // landr-1ztq — Group-by dropdown (Table layout only). Other layouts
      // ignore the value; the dropdown stays in the toolbar so the operator
      // sees one consistent control surface across layouts.
      groupByLabel: 'Group:',
      groupByNone: 'No grouping',
      // landr-4cwh — Board swimlanes (secondary grouping).
      swimlaneLabel: 'Swimlanes:',
      swimlaneNone: 'None (flat)',
      // landr-79f5 — layout-locked placeholder shown on non-Board layouts
      // so operators can see the control exists. The Tooltip explains the
      // gate: switch to Board to use it.
      swimlanePlaceholder: 'Swimlanes (Board only)',
      swimlaneLockedTip: 'Switch to Board layout to use swimlanes.',
      // landr-9nj9 — Board column-by picker (primary grouping). "None"
      // clears the key so the BoardLayout default fallback kicks in
      // (first enum field, typically current_stage).
      columnByLabel: 'Column by:',
      columnByNone: 'Default',
      // landr-79f5 — layout-locked placeholder shown on non-Board layouts.
      columnByPlaceholder: 'Column by (Board only)',
      columnByLockedTip: 'Switch to Board layout to use column-by.',
    },
    filters: {
      addFilter: '+ Filter',
      remove: 'Remove filter',
      fieldLabel: 'Field',
      opLabel: 'Operator',
      valueLabel: 'Value',
      apply: 'Apply',
      cancel: 'Cancel',
    },
    body: {
      // landr-lx7s — shared loading/error copy used by all 3 layout branches
      // (Table / Board / Calendar). Per-layout buckets keep only their
      // layout-specific strings.
      loading: 'Loading items…',
      loadError: 'Failed to load items.',
      calendar: {
        placeholderTitle: 'Pick a date field to use Calendar layout',
        placeholderBody:
          'Open the view settings and set a date field (e.g. Start date) for the Calendar layout to plot items on.',
        empty: 'No items to display.',
      },
      board: {
        mustBeEnum: 'Column-by must be an enum field.',
        unknownField: (key: string) => `Unknown column-by field: ${key}.`,
        unsupportedField: (label: string) =>
          `Column-by on '${label}' is not wired up yet — only Stage is supported in v1.`,
        emptyColumn: 'No items',
        disallowedTarget: 'No supported transition into this column.',
        mutateError: 'Could not move card — change reverted.',
        // landr-4cwh — swimlane (secondary grouping) copy.
        swimlaneUnknownField: (key: string) =>
          `Unknown swimlane field: ${key}.`,
        swimlaneMustBeGroupable:
          'Swimlane field must be an enum or id field.',
        swimlaneEmptyCell: '—',
      },
    },
    // landr-7w3s — Table layout copy.
    table: {
      loading: 'Loading items…',
      loadError: 'Failed to load items.',
      empty: 'No items match this view.',
      rowCount: (visible: number, total: number) =>
        visible === total
          ? `${total} item${total === 1 ? '' : 's'}`
          : `${visible} of ${total} items`,
      columnPickerLabel: 'Columns',
      columnPickerHeading: 'Visible columns',
      columnPickerEmpty: 'No columns available for this entity.',
      moneyFallback: '—',
      dateFallback: '—',
      // landr-1ztq — group header chrome.
      groupCountSuffix: (n: number): string => `(${n})`,
      groupNullLabel: '— Empty —',
      groupCollapse: (label: string): string => `Collapse ${label}`,
      groupExpand: (label: string): string => `Expand ${label}`,
    },
  },
  // landr-p600 — Dashboard home revamp. Daily-ops view with today's
  // bookings list, this-week summary cards (revenue + spark, bookings,
  // new contacts), pending-approvals badge, and a recent-activity feed.
  dashboard: {
    title: 'Dashboard',
    loading: 'Loading dashboard…',
    error: 'Failed to load dashboard.',
    todayHeading: "Today's bookings",
    todayEmpty: 'No bookings today — enjoy the quiet!',
    todayCount: (n: number): string =>
      n === 1 ? '1 booking' : `${n} bookings`,
    weekRevenueLabel: 'Revenue this week',
    weekBookingsLabel: 'Bookings this week',
    weekContactsLabel: 'New contacts this week',
    weekRevenueEmpty: 'No revenue yet.',
    // landr-ar44 — short context chips on the dashboard stat cards. The
    // big number reads at a glance; the chip qualifies the timeframe.
    statContextWeek: 'This week',
    pendingApprovalsLabel: 'Pending approvals',
    pendingApprovalsCta: 'Review queue',
    pendingApprovalsEmpty: 'All clear — nothing pending.',
    pendingApprovalsCount: (n: number): string =>
      n === 1 ? '1 awaiting' : `${n} awaiting`,
    activityHeading: 'Recent activity',
    activityEmpty: 'Nothing yet — check back after your first booking.',
    activityBookingCreated: 'New booking',
    activityContactCreated: 'New contact',
    activityApprovalPending: 'Awaiting approval',
    customerFallback: 'Unknown customer',
    // landr-kav4 — today's-capacity card on the dashboard home.
    capacityHeading: "Today's capacity",
    capacityEmpty: 'No schedulable products with per-unit capacity yet.',
    capacityRowAria: (name: string, booked: number, capacity: number): string =>
      `${name}: ${booked} of ${capacity} booked`,
    // landr-a99u.12 — operator go-live request banner on dashboard home.
    goLiveBannerTitle: 'Ready to go live?',
    goLiveBannerDescription:
      "You're on staging. Everything looking good? Request go-live and Landr staff will review and ship it.",
    goLiveBannerButton: 'Request go-live',
    goLiveBannerRequestedTitle: 'Go-live requested',
    goLiveBannerRequestedDescription:
      'Landr will review your staging environment and promote it to production.',
    goLiveDialogTitle: 'Request go-live?',
    goLiveDialogDescription:
      'Landr staff will review staging and promote to production. Add a note for the reviewer if you like.',
    goLiveNotesLabel: 'Notes for the reviewer (optional)',
    goLiveNotesPlaceholder: 'e.g. tested checkout, calendar, and email flows',
    goLiveConfirmAction: 'Send request',
    goLiveAlreadyPending: 'A go-live request is already pending — staff will get to it shortly.',
    goLiveSuccessToast: 'Go-live requested — Landr will review and ship it!',
  },
  // landr-s1mr — Copy for the shared <EmptyState> cards across surfaces.
  // Each surface gets a friendly title + sub-copy + CTA so the empty
  // screen still tells the operator what to do next. Approvals uses the
  // celebratory tone (nothing pending is the *good* state).
  emptyStates: {
    bookings: {
      title: 'The skies are clear',
      description:
        'No bookings have landed yet. Share your booking link and watch the calendar fill up!',
    },
    contacts: {
      title: 'No adventurers yet',
      description:
        'Your roster is wide open. Contacts appear here automatically when the first booking comes in.',
    },
    products: {
      title: 'Nothing on the shelf',
      description:
        'Add your first product and let customers book their next adventure.',
      cta: 'New product',
    },
    views: {
      title: 'No saved views yet',
      description:
        'Saved views let you filter and revisit the bookings that matter most. Create one or start from a template.',
      cta: '+ New view',
    },
    calendar: {
      title: 'Wide-open skies',
      description:
        'No flights scheduled. Once bookings come in they\'ll appear right here on the calendar.',
    },
    tickets: {
      title: 'All quiet in the inbox',
      description:
        'No support tickets yet. When customers need help, their messages will land here.',
    },
    recentlyViewed: {
      title: 'Nothing here yet',
      description: 'Bookings, contacts, products and views you open will land here.',
    },
    approvals: {
      title: 'All caught up',
      description: 'No approvals are waiting on you right now. Nice work.',
    },
  },
  // landr-v6aq — shared strings for the delete + undo confirmation toast.
  // Used by src/lib/undo-toast.ts so every soft-delete surface (booking
  // cancel, product delete, future trash kinds) speaks the same copy.
  undo: {
    action: 'Undo',
    restored: 'Back again!',
    restoreError: 'Could not undo — try restoring from the Trash page.',
    // Per-kind toast headers. Composed in the call site as
    // `t.undo.deleted(kind, label)` so the noun stays close to the action.
    deletedBooking: (label: string): string => `Booking deleted — ${label}`,
    deletedProduct: (label: string): string => `Product deleted — ${label}`,
  },
  // landr-ah9u — Settings → Webhooks. v1 is a UI-only configuration
  // surface that persists the operator's webhook list to localStorage;
  // v2 (future) graduates to operator_webhooks + a background delivery
  // worker. Copy here covers the list, the add/edit dialog, validation
  // errors, and the 'v1 stub' notice that warns the operator nothing is
  // wired up to actually POST yet.
  webhooksSettings: {
    title: 'Webhooks',
    subtitle:
      'Subscribe an HTTPS endpoint to receive booking and payment events.',
    v1Notice:
      'Configuration saved locally. Server-side delivery in v2.',
    addButton: 'Add webhook',
    empty: 'No webhooks yet. Add one to subscribe to events.',
    edit: 'Edit',
    delete: 'Delete',
    confirmDelete: 'Confirm delete',
    cancel: 'Cancel',
    dialogAddTitle: 'Add webhook',
    dialogEditTitle: 'Edit webhook',
    dialogDescription:
      'Enter the endpoint URL and pick the events you want to receive.',
    fieldUrl: 'Endpoint URL',
    fieldUrlPlaceholder: 'https://example.com/webhooks/landr',
    fieldUrlHint: 'Must start with https://',
    fieldEvents: 'Events',
    fieldEventsHint: 'Choose at least one event to subscribe to.',
    fieldSecret: 'Signing secret',
    fieldSecretHint:
      'Use this secret to verify the HMAC signature on delivered payloads (v2).',
    fieldSecretCopy: 'Copy secret',
    fieldSecretCopied: 'Secret copied to clipboard.',
    fieldSecretCopyError: 'Could not copy. Select + copy manually.',
    errorUrlRequired: 'Enter an endpoint URL.',
    errorUrlInvalid: 'Enter a valid https:// URL.',
    errorEventsRequired: 'Pick at least one event.',
    save: 'Save webhook',
    create: 'Add webhook',
    toastCreated: 'Webhook saved locally.',
    toastUpdated: 'Webhook updated.',
    toastDeleted: 'Webhook deleted.',
    // Display names for each event in WEBHOOK_EVENTS — keep aligned with
    // src/lib/webhooks.ts. The wire name (e.g. 'booking.created') is the
    // contract; this lookup is purely for the UI label.
    eventLabels: {
      'booking.created': 'Booking created',
      'booking.approved': 'Booking approved',
      'booking.cancelled': 'Booking cancelled',
      'booking.completed': 'Booking completed',
      'payment.received': 'Payment received',
    },
  },
  // landr-40x0 — client-side error capture history (ErrorHistoryBell + notify).
  errorHistory: {
    openLabel: 'Open error history',
    badgeLabel: (n: number): string =>
      `${n} error${n === 1 ? '' : 's'} captured`,
    heading: 'Recent errors',
    empty: 'No errors this session. All good!',
    clearAll: 'Clear all',
    copyLabel: 'Copy error details',
    reportLabel: 'Report this error',
    copiedToast: 'Error details copied.',
    copyFailedToast: 'Could not copy to clipboard.',
  },
  // landr-aoak.3 — staff-mode booking widget modal. The topbar WidgetButton
  // mints a staff session and embeds the booking widget in an iframe so the
  // operator can book on the customer's behalf (force-book full days, price
  // override) without leaving the dashboard.
  staffWidget: {
    // WidgetButton trigger (icon button) — replaces the old "open in new tab".
    openLabel: 'New booking (staff)',
    openTitle: 'Book on behalf of a customer',
    // Modal chrome.
    dialogTitle: 'New booking',
    dialogDescription:
      'Book for a customer in staff mode. Operator overrides — force-book a full day, price override — are available here.',
    iframeTitle: 'Booking widget (staff mode)',
    // Mint failure (e.g. 503 session_signing_unavailable, or 403 membership).
    mintError: (msg: string): string =>
      `Couldn't start a staff booking session: ${msg}`,
    // Completion toast after the widget posts landr:booking-created.
    createdToast: 'Booking created! Opening it now…',
  },
  // landr-6s44 — operator-wide "set up branded email sending" nudge banner.
  // Kept in its own top-level key (distinct from emailSenderSettings above)
  // to minimise merge conflicts with other in-flight strings.ts edits.
  emailSenderNudge: {
    title: "Branded email sending isn't set up",
    body:
      'Your booking emails send from the Landr fallback address until your own sending domain is verified.',
    cta: 'Set it up',
    dismiss: 'Dismiss',
  },
} as const
