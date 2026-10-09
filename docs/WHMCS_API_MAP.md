# OnTrack Command — WHMCS core feature map

This list represents routes implemented in the **mobile app**, not new server endpoints.

| Native UI | Documented WHMCS action | Status |
|---|---|---|
| Dashboard | GetTickets / GetClients / GetInvoices / GetClientsProducts / GetOrders / GetClientsDomains | Source ready, live test pending |
| Support ticket list | GetTickets | Source ready, live test pending |
| Ticket details & replies | GetTicket / AddTicketReply | Source ready; server permission enforced on submit |
| Clients | GetClients | Source ready |
| Services | GetClientsProducts | Source ready |
| Invoices | GetInvoices | Source ready |
| Orders | GetOrders | Source ready |
| Domains | GetClientsDomains | Source ready |
| Read-only API catalog | 16 WHMCS API calls, each dynamically fetched | Source ready, some schemas/version compatibility untested |
| WhatsApp Notifications | Existing addon endpoints NOT verified | Not connected; no guesses |
| AI Support Agent | Existing addon endpoints NOT verified | Not connected; no guesses |
| Push/FCM | Not part of WHMCS External API | Not implemented |

## Why no additional WHMCS addon?

WHMCS Core functions are available from the official `/includes/api.php`. Writing or installing a new server addon just to use these functions adds unnecessary operational risk. Existing custom addons must expose verifiable, authenticated APIs before a mobile application can safely call their internal functions; embedding admin session cookies or bypassing CSRF is **not** an acceptable substitute.

## Important security caveat

Without a separately managed backend broker (prohibited by the requested architecture), the mobile device must retain API credentials. Generate **dedicated, least-privilege WHMCS API Credentials**, restrict them to the roles needed, revoke compromised tokens, and never distribute production credentials in a prebuilt application or a GitHub repository. Legacy admin login is included for compatibility with the official Android app but is not the recommended production setup.
