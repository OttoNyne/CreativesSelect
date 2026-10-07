import { authApi } from "../api/auth.api";
import { EmailLinkPage } from "./EmailLinkPage";

// The link sent to the NEW address: opening it is what proves the address is theirs, and makes the change.
export function ConfirmEmailChangePage() {
  return (
    <EmailLinkPage
      act={authApi.confirmEmailChange}
      working="Changing your email…"
      doneTitle="Email changed"
      doneText="Your account now uses this address. Use it to log in from now on."
      failedTitle="Couldn't change your email"
      missingText="This page needs the link from the email we sent to your new address. Open that link from the email."
      next={{ signedIn: { to: "/", label: "Go to your feed" }, signedOut: { to: "/login", label: "Log in" } }}
    />
  );
}

// The link sent to the OLD address when the change was made, good for a week: the way back if it wasn't the owner who made it.
export function UndoEmailChangePage() {
  return (
    <EmailLinkPage
      act={authApi.revertEmailChange}
      working="Putting your old email back…"
      doneTitle="Your old email is back"
      doneText="Your account uses its old address again and every device has been signed out. Use “Forgot password” on the login page to choose a new password."
      failedTitle="Couldn't put your old email back"
      missingText="This page needs the link from the email we sent to your old address. Open that link from the email."
      next={{ signedIn: { to: "/forgot-password", label: "Choose a new password" }, signedOut: { to: "/forgot-password", label: "Choose a new password" } }}
    />
  );
}
