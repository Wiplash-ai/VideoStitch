# Public/private architecture boundary

VideoStitch is the public product surface. Madbot remains the private execution and operations environment until the backend warrants an independently deployable private repository.

```text
VideoStitch (public)                     Madbot (private)
--------------------                     ----------------
Web UI and extension        HTTPS/MCP    Render workers and queues
Local project store        ---------->   Paid-job orchestration
Project/edit-plan schemas  <----------   Artifact and QA results
Browser preview/render                  Billing and private workflows
Public skill and API clients             Credentials and operations
```

The boundary is contract-first. VideoStitch may publish versioned request and response schemas, capability discovery, stable error codes, and sanitized fixtures. Madbot implements private adapters behind those contracts.

VideoStitch must never contain Madbot credentials, internal hostnames, filesystem paths, raw production configuration, proprietary skill content, uncleared media, or deployment instructions. Browser features must also remain functional when Madbot is unavailable unless the UI explicitly identifies a backend-only operation.
