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
    sessionExpired: 'Your session expired — please sign in again.',
    continueWith: (provider: string) => `Continue with ${provider}`,
    continueWithLoading: (provider: string) => `Connecting to ${provider}…`,
    continueDivider: 'or',
    emailInUseTitle: 'That email already has an account',
    emailInUseBody:
      'Sign in with your password, then connect Google from Settings → Connected accounts.',
    oauthUnknownError:
      'Sign-in did not complete. Please try again or use your password.',
  },
  connectedAccounts: {
    title: 'Connected accounts',
    description:
      'Link additional sign-in methods to your account. You can sign in with any linked provider.',
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
    disconnectDisabledTooltip: 'Cannot remove your only sign-in method.',
    confirmDisconnectTitle: 'Disconnect this provider?',
    confirmDisconnectBody: (provider: string) =>
      `You will no longer be able to sign in with ${provider}. You can re-connect later.`,
    confirmDisconnectCancel: 'Keep connected',
    confirmDisconnectAction: 'Disconnect',
    toastLinked: (provider: string) => `${provider} connected.`,
    toastLinkError: (provider: string) => `Failed to connect ${provider}.`,
    toastUnlinked: (provider: string) => `${provider} disconnected.`,
    toastUnlinkError: (provider: string) => `Failed to disconnect ${provider}.`,
  },
  operator: {
    switcherLabel: 'Operator',
    noOperators: 'No operators available for this account.',
    switchTo: 'Switch operator',
    loading: 'Loading operators…',
  },
  nav: {
    sectionMain: 'Workspace',
    sectionAdmin: 'Admin',
    dashboard: 'Dashboard',
    bookings: 'Bookings',
    calendar: 'Calendar',
    contacts: 'Contacts',
    products: 'Products',
    reporting: 'Reporting',
    generalApprovals: 'Approvals',
    staff: 'Staff',
    settings: 'Settings',
    emailTemplates: 'Email templates',
    pickupLocations: 'Pickup locations',
    schedule: 'Schedule',
  },
  settingsHub: {
    navLabel: 'Settings sections',
    sections: {
      company: 'Company',
      calendarDisplay: 'Calendar & display',
      displayPreferences: 'Display preferences',
      team: 'Team',
      pickupLocations: 'Pickup locations',
      emailTemplates: 'Email templates',
      integrationsGmail: 'Gmail',
      connectedAccounts: 'Connected accounts',
      plan: 'Plan',
      pricing: 'Pricing',
    },
    plan: {
      title: 'Plan',
      description: 'Your current subscription plan.',
      currentLabel: 'Current plan',
      slugLabel: 'Plan slug',
      noPlan: 'No plan information available.',
      upgradeHint:
        'Plan upgrades will land in a future release. Contact support to change your plan today.',
    },
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
    columnDate: 'Booked on',
    columnServiceDate: 'Service date',
    columnCustomer: 'Customer',
    columnProduct: 'Product',
    columnStatus: 'Status',
    columnPrice: 'Price',
    columnDays: 'Days',
    filterPlaceholder: 'Search bookings…',
    detailsTitle: 'Booking',
    detailsClose: 'Close',
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
    detail: {
      sectionStatus: 'Status',
      sectionCustomer: 'Customer',
      sectionDates: 'Dates',
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
      recomputeHint: 'Recomputed automatically on save.',
      save: 'Save changes',
      saving: 'Saving…',
      cancel: 'Cancel',
      noChanges: 'No changes to save.',
      saveToastSuccess: 'Booking updated.',
      saveToastError: 'Failed to save booking.',
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
    // landr-f1s — off-hours expand/collapse for the time-grid views.
    expandOffHours: (start: string, end: string): string =>
      `Show hours outside ${start}–${end}`,
    collapseOffHours: 'Hide off-hours',
  },
  contacts: {
    title: 'Contacts',
    empty: 'No contacts yet.',
    loading: 'Loading contacts…',
    error: 'Failed to load contacts.',
    columnName: 'Name',
    columnEmail: 'Email',
    columnPhone: 'Phone',
    columnCreated: 'Created',
    columnStatus: 'Status',
    columnActivity: 'Activity',
    columnActions: 'Actions',
    filterPlaceholder: 'Search contacts…',
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
    auditClose: 'Close',
    eraseDialogTitle: 'Trigger GDPR erase',
    eraseDialogIntro:
      'This will scrub all PII from this contact, the audit log, and any linked bookings. Commercial fields are preserved per Spanish 6-year retention. This action is irreversible.',
    eraseDialogConfirmLabel: 'Type ERASE to confirm',
    eraseDialogReasonLabel: 'Jurisdiction note (required)',
    eraseDialogReasonPlaceholder: 'e.g. GDPR Art. 17 request via email 2026-05-…',
    eraseDialogCancel: 'Cancel',
    eraseDialogSubmit: 'Erase contact',
    activityRecent: 'Recent: ',
    // landr-pqk — sort dropdown + derived-type filter chips.
    filters: {
      sortLabel: 'Sort',
      sortRecentlyAdded: 'Recently added',
      sortRecentlyChanged: 'Recently changed',
      sortAlphabetical: 'Alphabetical',
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
    },
  },
  customerDetail: {
    title: 'Customer',
    loading: 'Loading customer…',
    error: 'Failed to load customer.',
    fieldFirstName: 'First name',
    fieldLastName: 'Last name',
    fieldEmail: 'Email',
    fieldPhone: 'Phone',
    fieldPreferredLocale: 'Preferred language',
    localeNone: '— No preference —',
    save: 'Save changes',
    saving: 'Saving…',
    cancel: 'Cancel',
    close: 'Close',
    noChanges: 'No changes to save.',
    invalidEmail: 'Enter a valid email address.',
    toastSuccess: 'Customer updated.',
    toastError: 'Failed to update customer.',
    discardTitle: 'Discard unsaved changes?',
    discardDescription:
      'You have unsaved edits. Closing now will lose them.',
    discardCancel: 'Keep editing',
    discardConfirm: 'Discard',
    openAriaLabel: (name: string) => `Open customer ${name}`,
  },
  products: {
    title: 'Products & pricing',
    loading: 'Loading products…',
    error: 'Failed to load products.',
    empty: 'No products yet. Create one to get started.',
    noMatches: 'No products match your filter.',
    filterPlaceholder: 'Search products…',
    listAriaLabel: 'Products',
    createNew: 'New product',
    headingNew: 'New product',
    headingPick: 'Select a product',
    pickHint: 'Pick a product on the left to edit, or create a new one.',
    statusActive: 'Active',
    statusInactive: 'Inactive',

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
    fieldSortOrder: 'Sort order',
    optionNone: '— None —',

    legendFlags: 'Flags',
    flagActive: 'Active',
    flagPubliclyListed: 'Publicly listed',
    flagNeedsProvider: 'Needs a provider',
    flagNeedsPickup: 'Needs pickup',
    flagRevenueThroughOperator: 'Revenue flows through operator',
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

    formCreateLabel: 'Create product form',
    formEditLabel: 'Edit product form',

    toastCreated: 'Product created.',
    toastUpdated: 'Product updated.',
    toastDeleted: 'Product deleted.',
    slugCollisionTitle: 'That slug is already taken',
    slugCollisionBody:
      'A product with this slug already exists for your operator. Pick a different name or edit the slug.',
    duplicate: 'Duplicate',
    duplicating: 'Duplicating…',
    toastDuplicated: 'Product duplicated — edit and save.',

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
    windowEmpty: 'No windows yet — add the first one to make this product bookable.',
    windowFormStart: 'Start date',
    windowFormEnd: 'End date',
    windowFormCapacity: 'Capacity',
    windowConfirmDelete: 'Delete this window?',
    windowErrorRange: 'End date must be on or after start date.',
    windowErrorCapacity: 'Capacity must be at least 1.',
    windowErrorLoad: 'Failed to load course windows.',
    windowErrorSave: 'Failed to save window.',
    windowErrorDelete: 'Failed to delete window.',
  },
  generalApprovals: {
    title: 'Pending approvals',
    empty: 'No bookings awaiting general approval.',
    loading: 'Loading approval queue…',
    error: 'Failed to load approval queue.',
    columnDate: 'Date',
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
  },
  staff: {
    title: 'Staff',
    subtitle:
      'Manage operator memberships, roles and per-user permissions.',
    loading: 'Loading staff…',
    error: 'Failed to load staff.',
    empty: 'No staff yet. Use “Invite by email” to add a member.',
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
      'Add a user to this operator. The user must already exist in LANDR (signed-in once via the mobile app or dashboard).',
    inviteEmailLabel: 'Email',
    inviteEmailPlaceholder: 'staff@example.com',
    inviteRoleLabel: 'Role',
    invitePermissionsLabel: 'Permissions (JSON)',
    invitePermissionsHint:
      'Optional JSON object. Example: { "manage_bookings": true, "view_revenue": false }',
    inviteSubmit: 'Add membership',
    inviteSubmitting: 'Adding…',
    inviteCancel: 'Cancel',
    inviteToastSuccess: 'Staff member added.',
    inviteToastError: 'Failed to add staff member.',
    inviteUserNotFound:
      'No user found with that email. They must sign in to LANDR at least once first.',
    inviteEmailRequired: 'Enter a valid email address.',
    inviteRoleRequired: 'Role is required.',

    inviteDeferralNotice:
      'Email-invite send is deferred (landr-m05.15 Gmail OAuth). For now, the user must already be signed in to LANDR — this just links them to this operator.',

    // Edit sheet
    editTitle: 'Edit membership',
    editDescription:
      'Update the role and permissions for this staff member.',
    editRoleLabel: 'Role',
    editPermissionsLabel: 'Permissions (JSON)',
    editPermissionsHint:
      'Leave empty for no overrides. Must be a JSON object if set.',
    editSubmit: 'Save changes',
    editSubmitting: 'Saving…',
    editCancel: 'Cancel',
    editToastSuccess: 'Membership updated.',
    editToastError: 'Failed to update membership.',

    // Revoke confirm dialog
    revokeTitle: 'Revoke staff access?',
    revokeDescription:
      'This removes the membership for this user. They will no longer see this operator. Their global LANDR account is not affected. This action cannot be undone.',
    revokeConfirm: 'Type REVOKE to confirm',
    revokeCancel: 'Cancel',
    revokeSubmit: 'Revoke access',
    revokeSubmitting: 'Revoking…',
    revokeToastSuccess: 'Staff access revoked.',
    revokeToastError: 'Failed to revoke staff access.',

    permissionsParseError: 'Permissions JSON is invalid.',
  },
  settings: {
    title: 'Operator Settings',
    noOperator: 'No operator selected.',
    loading: 'Loading settings…',
    error: 'Failed to load settings.',
    save: 'Save changes',
    saving: 'Saving…',
    toastSuccess: 'Settings saved.',
    toastError: 'Failed to save settings.',

    sectionCompany: 'Company',
    sectionCompanyDesc: 'Your public-facing company identity. Slug is read-only.',
    sectionTax: 'Tax & Legal',
    sectionContact: 'Contact & Address',
    sectionLocale: 'Locale',
    sectionCalendar: 'Calendar & display',
    sectionCalendarDesc:
      'Tune the calendar to your working day. The primary view shows the hours you choose; off-hours collapse to a strip you can expand.',
    sectionDisplayPrefs: 'Display preferences',
    sectionDisplayPrefsDesc:
      'Control which product types and upgrade prompts appear in the dashboard.',
    fieldShowPremiumTeasers: 'Show upgrade prompts for premium features',
    fieldShowPremiumTeasersHint:
      'When enabled, your dashboard shows product types available on higher plans.',
    fieldShowPremiumTeasersFreeLockedHint:
      'Always shown on Free plan to highlight upgrade paths.',
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
    fieldWorkHoursStart: 'Work hours — start',
    fieldWorkHoursEnd: 'Work hours — end',
    fieldWorkHoursHint:
      'Defaults to 08:00 – 20:00. Calendar renders this window first; off-hours are one collapsible strip.',
    fieldTimeFormat: 'Time format',
    timeFormat24h: '24-hour (13:05)',
    timeFormat12h: '12-hour AM/PM (1:05 PM)',
    errorWorkHoursOrder: 'End time must be later than start time.',
    optionNone: '— Select —',

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
  },
  pickupLocations: {
    title: 'Pickup locations',
    subtitle: 'Manage pickup sites and sub-points for bookings.',
    loading: 'Loading locations…',
    error: 'Failed to load locations.',
    empty: 'No locations yet. Add one to get started.',
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
    fieldEmail: 'Contact email',
    fieldEmailHotel: 'Hotel contact email',
    fieldParentNone: '— Site level —',
    fieldRoleTypeNone: '— Select type —',

    errorNameRequired: 'Name is required.',
    errorRoleTypeRequired: 'Role type is required.',
    errorEmailFormat: 'Enter a valid email address.',
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
    rangeReset: 'Reset',
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
      'A manual “sync now” trigger from this screen is deferred until the ' +
      'matching FastAPI endpoint ships (landr-m05.9 carry-over).',
  },
  emailTemplates: {
    title: 'Email templates',
    subtitle: 'Customise the transactional emails sent to customers for each booking event.',
    loading: 'Loading email templates…',
    error: 'Failed to load email templates.',
    selectHint: 'Select a template kind and locale on the left to edit.',
    statusCustom: 'Custom',
    statusDefault: 'Default',

    kindLabels: {
      booking_received: 'Booking received',
      hotel_request: 'Hotel request',
      booking_confirmation: 'Booking confirmation',
    } as Record<string, string>,

    localeLabels: {
      de: 'German (de)',
      en: 'English (en)',
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
    previewStubBanner:
      'Live preview lands when the email sender ships (landr-m05.16). Showing raw template.',
    previewSubject: 'Subject',
    previewHtml: 'HTML',
    previewHtmlTitle: 'Email HTML preview',
    previewText: 'Plain text',
  },
  onboarding: {
    title: 'Welcome to LANDR',
    progress: (current: number, total: number) => `Step ${current} of ${total}`,
    next: 'Next',
    back: 'Back',
    skip: 'Skip for now',
    skipConfirm: "Are you sure? You can come back later from Settings.",
    finish: 'Finish setup',
    saving: 'Saving…',
    saveError: 'Could not save your changes. Try again.',
    rerunLink: 'Re-run onboarding',

    step1: {
      heading: 'Welcome to LANDR',
      body:
        'LANDR is the booking platform you use to take, confirm and run reservations for your activities. ' +
        'This short setup walks you through the essentials so you can start taking bookings today.',
      cta: "Let's get started",
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
        'Where do you pick customers up? Add at least one site so the booking widget can offer it ' +
        '(hotels, meeting points, harbour, etc.). You can add more later.',
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
        'Products are the activities customers can book. Start with a template — you can tune ' +
        'prices, durations and details later from the Products page.',
      templateGuided: 'Guided day',
      templateGuidedDesc: 'Single-day guided activity. Time-slot bookable, needs a guide.',
      templateCourse: 'Course (multi-day)',
      templateCourseDesc: 'Multi-day course over a fixed date range.',
      templateHotel: 'Hotel package',
      templateHotelDesc: 'Day activity bundled with hotel pickup. Needs hotel coordination.',
      create: 'Create',
      creating: 'Creating…',
      created: (name: string) => `Created “${name}”.`,
      createError: 'Could not create product. Open Products to add manually.',
      manage: 'Open products',
      count: (n: number) =>
        n === 0 ? 'No products yet.' : `${n} product${n === 1 ? '' : 's'} configured.`,
    },
    step6: {
      heading: 'Connect your Gmail',
      body:
        'Send booking emails from YOUR Gmail address — not a generic no-reply. Customers see ' +
        'emails coming from a real person at your company, which dramatically improves deliverability ' +
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
        'LANDR ships with sensible default templates for the three customer-facing emails. ' +
        'Open the Email templates page if you want to tweak the wording, otherwise the defaults are fine to ship with.',
      defaultKinds: 'Booking received · Hotel request · Booking confirmation',
      manage: 'Open email templates',
    },
    step8: {
      heading: 'Embed the booking widget',
      body:
        'Paste this WordPress shortcode anywhere on your website to show the booking widget. ' +
        'The widget reads your products, pickup locations and prices automatically.',
      copy: 'Copy',
      copied: 'Copied!',
      variantsTitle: 'Filter by product type (optional)',
      variantCourses: 'Courses only',
      variantSpecialty: 'Specialty experiences only',
      variantGuided: 'Guided days only',
      done: "I've embedded it",
    },
    step9: {
      heading: "You're ready to take bookings",
      body:
        'Setup complete. The dashboard is now your home base for managing reservations, ' +
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
      body: 'Complete the 9-step onboarding to start taking bookings.',
      resume: 'Resume',
      dismiss: 'Dismiss',
    },
  },
  schedule: {
    title: 'Schedule',
    description:
      'Manage bookable days for each product. Operators extend the seeded availability beyond the template window, block holidays, or adjust capacity per day.',
    productLabel: 'Product',
    productPlaceholder: 'Select a product…',
    noProducts: 'No products yet — create one in Products first.',
    loading: 'Loading availability…',
    error: 'Failed to load availability.',
    rangeHint:
      'Showing the visible month. Drag-select a range or click a single day.',
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
  },
} as const
