# Security

- Role checks are enforced server-side on admin pages and APIs.
- Public status lookup requires booking code + unguessable token hash match.
- Rate limiting applied to booking/evidence endpoints.
- Origin validation added for state-changing public APIs.
- Payment evidence served only via staff-authorized private endpoint.
- No plaintext password storage.
