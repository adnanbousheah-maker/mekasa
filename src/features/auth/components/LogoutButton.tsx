import { logout } from "../actions";

type Props = {
  className?: string;
};

export function LogoutButton({ className = "" }: Props) {
  return (
    <form action={logout}>
      <button
        type="submit"
        className={`min-h-12 px-4 text-[15px] text-muted underline-offset-4 hover:underline ${className}`}
      >
        تسجيل الخروج
      </button>
    </form>
  );
}
