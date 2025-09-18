import React from "react";
import Inbox from "../components/Inbox.jsx";
import { ErrorBoundary } from "../components/ErrorBoundary.jsx";

export default function InboxPage() {
  return (
    <ErrorBoundary>
      <Inbox />
    </ErrorBoundary>
  );
}
