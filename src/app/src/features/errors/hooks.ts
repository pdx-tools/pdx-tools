export {};

// import { getCurrentHub } from "@sentry/nextjs";
// import { Event, DsnComponents } from "@sentry/types";
// import { askToSendErrorReport } from "../notifications/ReportErrorConfirm";

// function eventProcessor(file: File, err: any) {
//   return (event: Event) => {
//     try {
//       const dsn = getCurrentHub().getClient()?.getDsn();
//       if (dsn === undefined || event.event_id === undefined) {
//         return event;
//       }

//       const endpoint = attachmentUrlFromDsn(dsn, event.event_id);
//       const formData = new FormData();
//       formData.append("failed-save", file, file.name);
//       askToSendErrorReport(err, () => {
//         return fetch(endpoint, {
//           method: "POST",
//           body: formData,
//         }).catch((ex) => {
//           // we have to catch this otherwise it throws an infinite loop in Sentry
//           console.error(ex);
//         });
//       });
//     } catch (ex) {
//       console.error(ex);
//     }
//     return event;
//   };
// }

// function attachmentUrlFromDsn(dsn: DsnComponents, eventId: string) {
//   const { host, path, projectId, port, protocol, publicKey } = dsn;
//   return `${protocol}://${host}${port !== "" ? `:${port}` : ""}${
//     path !== "" ? `/${path}` : ""
//   }/api/${projectId}/events/${eventId}/attachments/?sentry_key=${publicKey}&sentry_version=7&sentry_client=custom-javascript`;
// }
