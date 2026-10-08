import { authApi } from "../api/auth.api";
import { EmailLinkPage } from "./EmailLinkPage";
import { t } from "../i18n";

// The link sent to the NEW address: opening it is what proves the address is theirs, and makes the change.
export function ConfirmEmailChangePage() {
  return (
    <EmailLinkPage
      act={authApi.confirmEmailChange}
      working={t("emailChange.working")}
      doneTitle={t("emailChange.doneTitle")}
      doneText={t("emailChange.done")}
      failedTitle={t("emailChange.failedTitle")}
      missingText={t("emailChange.missing")}
      next={{ signedIn: { to: "/", label: t("verify.goFeed") }, signedOut: { to: "/login", label: t("common.logIn") } }}
    />
  );
}

// The link sent to the OLD address when the change was made, good for a week: the way back if it wasn't the owner who made it.
export function UndoEmailChangePage() {
  return (
    <EmailLinkPage
      act={authApi.revertEmailChange}
      working={t("emailChange.undoWorking")}
      doneTitle={t("emailChange.undoDoneTitle")}
      doneText={t("emailChange.undoDone")}
      failedTitle={t("emailChange.undoFailedTitle")}
      missingText={t("emailChange.undoMissing")}
      next={{ signedIn: { to: "/forgot-password", label: t("emailChange.chooseNewPassword") }, signedOut: { to: "/forgot-password", label: t("emailChange.chooseNewPassword") } }}
    />
  );
}
