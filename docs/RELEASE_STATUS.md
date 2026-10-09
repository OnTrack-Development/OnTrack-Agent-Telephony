# v0.3.5 / build 16

| Gate | Status |
| --- | --- |
| Existing WHMCS core screens and ticket workflow | Retained; existing regression tests pass |
| Native WhatsApp list, history, unread counts and text send | Implemented against existing module routes; mock-contract tests pass |
| WHMCS native admin session | Implemented; scoped cookies, login/OTP, CSRF and logout tests pass |
| Ticket custom fields and return-to-AI hook | Implemented with existing admin HTML and action nonce; fixture tests pass |
| New ticket | Implemented using OpenTicket with verified owner/guest and department |
| AI live agent/queue snapshot | Implemented against existing authenticated snapshot endpoint |
| TypeScript checks | Pass |
| Android prebuild and native module registration | Pass locally |
| Android release build and existing-key signature | Pending CI |
| GitHub release, automatic website sync and APK checksum | Pending CI |
| Signed-in device verification against live WHMCS modules | Not performed |

No WHMCS module files were changed. Text sending does not silently retry. Unsupported authentication, expired sessions and closed reply windows stop the action with a visible error.
