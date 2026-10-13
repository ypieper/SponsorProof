# Local German bank directory

`de-banks.json` is derived from the Deutsche Bundesbank bank sort code CSV, valid from 7 September through 6 December 2026. It contains active leading payment service provider records keyed by bank sort code, with institution name and BIC.

Source: https://www.bundesbank.de/de/aufgaben/unbarer-zahlungsverkehr/serviceangebot/bankleitzahlen/download-bankleitzahlen-602592

Refresh this file from the current Bundesbank CSV when its validity period ends. The application performs German IBAN bank lookups locally and does not send account numbers to a third-party service.
