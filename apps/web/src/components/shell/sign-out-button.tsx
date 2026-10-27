import { LogOut } from "lucide-react";

/** A plain form post, so signing out works without JavaScript. */
export function SignOutButton() {
  return (
    <form action="/api/auth/logout" method="post">
      <button
        type="submit"
        className="flex h-[34px] w-full items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] font-medium text-ink-2 hover:bg-desk"
      >
        <LogOut className="size-4 text-ink-3" aria-hidden="true" />
        Sair
      </button>
    </form>
  );
}
