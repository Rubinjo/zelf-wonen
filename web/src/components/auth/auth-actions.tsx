"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
    ArrowRight,
    BadgeCheck,
    LoaderCircle,
    LogOut,
    Mail,
    UserRound,
    X,
} from "lucide-react";
import { signIn, signOut, signUp, useSession } from "@/lib/auth-client";

type Language = "nl" | "en";
type AuthMode = "sign-in" | "sign-up";

const copy = {
    nl: {
        signIn: "Inloggen",
        signUp: "Gratis account",
        signOut: "Uitloggen",
        account: "Jouw account",
        titleSignIn: "Welkom terug",
        titleSignUp: "Maak je account",
        introSignIn: "Log in om verder te gaan met je woningen.",
        introSignUp: "Na registratie verifieer je eerst je e-mailadres.",
        name: "Naam",
        email: "E-mailadres",
        password: "Wachtwoord",
        passwordHint: "Minimaal 10 tekens",
        submitSignIn: "Inloggen",
        submitSignUp: "Account maken",
        noAccount: "Nog geen account?",
        hasAccount: "Heb je al een account?",
        verifyTitle: "Controleer je e-mail",
        verifyText:
            "We hebben een verificatielink verstuurd. Na verificatie word je automatisch ingelogd.",
        localVerify:
            "Lokale ontwikkeling: de verificatielink staat in de Next.js-terminal.",
        close: "Sluiten",
        signedInAs: "Ingelogd als",
        verified: "E-mail geverifieerd",
        unverified: "E-mail nog verifiëren",
        genericError: "Er ging iets mis. Probeer het opnieuw.",
    },
    en: {
        signIn: "Sign in",
        signUp: "Sign up",
        signOut: "Sign out",
        account: "Your account",
        titleSignIn: "Welcome back",
        titleSignUp: "Create your account",
        introSignIn: "Sign in to continue managing your properties.",
        introSignUp: "After registration, verify your email address first.",
        name: "Name",
        email: "Email address",
        password: "Password",
        passwordHint: "At least 10 characters",
        submitSignIn: "Sign in",
        submitSignUp: "Create account",
        noAccount: "No account yet?",
        hasAccount: "Already have an account?",
        verifyTitle: "Check your email",
        verifyText:
            "We sent a verification link. After verification, you will be signed in automatically.",
        localVerify:
            "Local development: the verification link is printed in the Next.js terminal.",
        close: "Close",
        signedInAs: "Signed in as",
        verified: "Email verified",
        unverified: "Email verification needed",
        genericError: "Something went wrong. Please try again.",
    },
} as const;

function getErrorMessage(error: unknown, fallback: string) {
    if (error && typeof error === "object" && "message" in error) {
        const message = error.message;
        if (typeof message === "string" && message.length > 0) {
            return message;
        }
    }
    return fallback;
}

export function AuthActions({
    language,
    placement = "header",
    dashboardHref = "/dashboard",
    dashboardLabel = "Dashboard",
    ctaLabel,
}: {
    language: Language;
    placement?: "header" | "cta";
    dashboardHref?: string;
    dashboardLabel?: string;
    ctaLabel?: string;
}) {
    const t = copy[language];
    const router = useRouter();
    const {
        data: session,
        isPending: isSessionPending,
        refetch,
    } = useSession();
    const [mode, setMode] = useState<AuthMode | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSigningOut, setIsSigningOut] = useState(false);
    const [error, setError] = useState("");
    const [verificationSent, setVerificationSent] = useState(false);

    useEffect(() => {
        if (!mode) return;

        const previousBodyOverflow = document.body.style.overflow;
        const previousHtmlOverflow = document.documentElement.style.overflow;

        document.body.style.overflow = "hidden";
        document.documentElement.style.overflow = "hidden";

        function handleEscape(event: KeyboardEvent) {
            if (event.key === "Escape") setMode(null);
        }

        document.addEventListener("keydown", handleEscape);
        return () => {
            document.removeEventListener("keydown", handleEscape);
            document.body.style.overflow = previousBodyOverflow;
            document.documentElement.style.overflow = previousHtmlOverflow;
        };
    }, [mode]);

    function open(nextMode: AuthMode) {
        setError("");
        setVerificationSent(false);
        setMode(nextMode);
    }

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError("");
        setIsSubmitting(true);

        const form = new FormData(event.currentTarget);
        const email = String(form.get("email") ?? "").trim();
        const password = String(form.get("password") ?? "");

        try {
            if (mode === "sign-up") {
                const name = String(form.get("name") ?? "").trim();
                const result = await signUp.email({
                    name,
                    email,
                    password,
                    callbackURL: "/dashboard",
                });
                if (result.error) throw result.error;
                setVerificationSent(true);
                return;
            }

            const result = await signIn.email({
                email,
                password,
                callbackURL: "/dashboard",
            });
            if (result.error) throw result.error;
            await refetch();
            setMode(null);
            router.refresh();
        } catch (caughtError) {
            setError(getErrorMessage(caughtError, t.genericError));
        } finally {
            setIsSubmitting(false);
        }
    }

    async function handleSignOut() {
        setIsSigningOut(true);
        try {
            await signOut();
            await refetch();
            router.refresh();
        } finally {
            setIsSigningOut(false);
        }
    }

    if (isSessionPending) {
        return (
            <span
                className="grid size-10 place-items-center text-muted"
                aria-label="Loading session"
            >
                <LoaderCircle className="size-4 animate-spin" />
            </span>
        );
    }

    if (session) {
        if (placement === "cta") {
            return (
                <Link
                    href={dashboardHref}
                    className="mt-8 inline-flex items-center gap-3 rounded-full bg-white/70 px-5 py-3 text-sm font-semibold text-brand-dark transition hover:bg-white"
                >
                    <BadgeCheck className="text-brand" size={19} />
                    {ctaLabel ?? dashboardLabel} <ArrowRight size={17} />
                </Link>
            );
        }

        return (
            <div className="flex items-center gap-2">
                <div className="hidden text-right lg:block">
                    <p className="max-w-44 truncate text-sm font-semibold">
                        {session.user.name}
                    </p>
                    <p className="flex items-center justify-end gap-1 text-[11px] text-muted">
                        {session.user.emailVerified ? t.verified : t.unverified}
                    </p>
                </div>
                <Link
                    href={dashboardHref}
                    className="hidden h-10 items-center rounded-full bg-brand px-4 text-sm font-semibold text-white transition hover:bg-brand-dark sm:inline-flex"
                >
                    {dashboardLabel}
                </Link>
                <span
                    className="grid size-10 place-items-center rounded-full bg-brand text-sm font-bold text-white"
                    title={session.user.email}
                >
                    {session.user.name.charAt(0).toUpperCase()}
                </span>
                <button
                    type="button"
                    onClick={handleSignOut}
                    disabled={isSigningOut}
                    className="grid size-10 place-items-center rounded-full border border-line bg-surface transition hover:border-brand/30 hover:text-brand disabled:opacity-50"
                    aria-label={t.signOut}
                    title={t.signOut}
                >
                    {isSigningOut ? (
                        <LoaderCircle className="size-4 animate-spin" />
                    ) : (
                        <LogOut size={17} />
                    )}
                </button>
            </div>
        );
    }

    return (
        <>
            {placement === "header" ? (
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => open("sign-in")}
                        className="hidden h-10 rounded-full border border-line bg-surface px-4 text-sm font-semibold transition hover:border-brand/30 sm:block"
                    >
                        {t.signIn}
                    </button>
                    <button
                        type="button"
                        onClick={() => open("sign-up")}
                        className="hidden h-10 rounded-full bg-brand px-4 text-sm font-semibold text-white transition hover:bg-brand-dark lg:block"
                    >
                        {t.signUp}
                    </button>
                    <button
                        type="button"
                        onClick={() => open("sign-in")}
                        className="grid size-10 place-items-center rounded-full border border-line bg-surface sm:hidden"
                        aria-label={t.signIn}
                    >
                        <UserRound size={17} />
                    </button>
                </div>
            ) : (
                <button
                    type="button"
                    onClick={() => open("sign-up")}
                    className="mt-8 inline-flex h-14 items-center gap-2 rounded-full bg-brand-dark px-7 font-semibold text-white transition hover:-translate-y-0.5 hover:bg-brand"
                >
                    {ctaLabel ?? t.signUp} <ArrowRight size={18} />
                </button>
            )}

            {mode && typeof document !== "undefined"
                ? createPortal(
                      <div
                          className="fixed inset-0 z-2000 flex min-h-dvh items-center justify-center overflow-y-auto bg-brand-dark/55 p-4 backdrop-blur-sm sm:p-8"
                          role="presentation"
                          onMouseDown={(event) => {
                              if (event.currentTarget === event.target)
                                  setMode(null);
                          }}
                      >
                          <section
                              role="dialog"
                              aria-modal="true"
                              aria-labelledby="auth-title"
                              className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-4xl border border-white/20 bg-surface p-6 text-left shadow-[0_30px_100px_rgba(6,74,58,.35)] sm:max-h-[calc(100dvh-4rem)] sm:p-8"
                          >
                              <div className="flex items-start justify-between gap-4">
                                  <span className="grid size-11 place-items-center rounded-2xl bg-accent text-brand-dark">
                                      {verificationSent ? (
                                          <Mail size={21} />
                                      ) : (
                                          <UserRound size={21} />
                                      )}
                                  </span>
                                  <button
                                      type="button"
                                      onClick={() => setMode(null)}
                                      className="grid size-9 place-items-center rounded-full text-muted transition hover:bg-background hover:text-foreground"
                                      aria-label={t.close}
                                  >
                                      <X size={18} />
                                  </button>
                              </div>

                              {verificationSent ? (
                                  <div className="mt-7">
                                      <h2
                                          id="auth-title"
                                          className="text-2xl font-semibold tracking-tight"
                                      >
                                          {t.verifyTitle}
                                      </h2>
                                      <p className="mt-3 leading-7 text-muted">
                                          {t.verifyText}
                                      </p>
                                      {process.env
                                          .NEXT_PUBLIC_EMAIL_DELIVERY_MODE ===
                                      "console" ? (
                                          <p className="mt-4 rounded-2xl bg-background p-4 text-sm leading-6 text-muted">
                                              {t.localVerify}
                                          </p>
                                      ) : null}
                                      <button
                                          type="button"
                                          onClick={() => setMode(null)}
                                          className="mt-7 h-12 w-full rounded-full bg-brand font-semibold text-white transition hover:bg-brand-dark"
                                      >
                                          {t.close}
                                      </button>
                                  </div>
                              ) : (
                                  <>
                                      <div className="mt-7">
                                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">
                                              {t.account}
                                          </p>
                                          <h2
                                              id="auth-title"
                                              className="mt-2 text-3xl font-semibold tracking-[-0.03em]"
                                          >
                                              {mode === "sign-in"
                                                  ? t.titleSignIn
                                                  : t.titleSignUp}
                                          </h2>
                                          <p className="mt-2 text-sm leading-6 text-muted">
                                              {mode === "sign-in"
                                                  ? t.introSignIn
                                                  : t.introSignUp}
                                          </p>
                                      </div>

                                      <form
                                          onSubmit={handleSubmit}
                                          className="mt-7 space-y-4"
                                      >
                                          {mode === "sign-up" ? (
                                              <label className="block text-sm font-semibold">
                                                  {t.name}
                                                  <input
                                                      name="name"
                                                      type="text"
                                                      autoComplete="name"
                                                      required
                                                      className="mt-2 h-12 w-full rounded-2xl border border-line bg-background px-4 font-normal outline-none transition focus:border-brand focus:ring-3 focus:ring-brand/10"
                                                  />
                                              </label>
                                          ) : null}
                                          <label className="block text-sm font-semibold">
                                              {t.email}
                                              <input
                                                  name="email"
                                                  type="email"
                                                  autoComplete="email"
                                                  required
                                                  className="mt-2 h-12 w-full rounded-2xl border border-line bg-background px-4 font-normal outline-none transition focus:border-brand focus:ring-3 focus:ring-brand/10"
                                              />
                                          </label>
                                          <label className="block text-sm font-semibold">
                                              {t.password}
                                              <input
                                                  name="password"
                                                  type="password"
                                                  autoComplete={
                                                      mode === "sign-in"
                                                          ? "current-password"
                                                          : "new-password"
                                                  }
                                                  minLength={10}
                                                  required
                                                  className="mt-2 h-12 w-full rounded-2xl border border-line bg-background px-4 font-normal outline-none transition focus:border-brand focus:ring-3 focus:ring-brand/10"
                                              />
                                              {mode === "sign-up" ? (
                                                  <span className="mt-1.5 block text-xs font-normal text-muted">
                                                      {t.passwordHint}
                                                  </span>
                                              ) : null}
                                          </label>

                                          {error ? (
                                              <p
                                                  role="alert"
                                                  className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700"
                                              >
                                                  {error}
                                              </p>
                                          ) : null}

                                          <button
                                              type="submit"
                                              disabled={isSubmitting}
                                              className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-brand font-semibold text-white transition hover:bg-brand-dark disabled:cursor-wait disabled:opacity-60"
                                          >
                                              {isSubmitting ? (
                                                  <LoaderCircle className="size-4 animate-spin" />
                                              ) : null}
                                              {mode === "sign-in"
                                                  ? t.submitSignIn
                                                  : t.submitSignUp}
                                          </button>
                                      </form>

                                      <p className="mt-6 text-center text-sm text-muted">
                                          {mode === "sign-in"
                                              ? t.noAccount
                                              : t.hasAccount}{" "}
                                          <button
                                              type="button"
                                              onClick={() =>
                                                  open(
                                                      mode === "sign-in"
                                                          ? "sign-up"
                                                          : "sign-in",
                                                  )
                                              }
                                              className="font-semibold text-brand hover:underline"
                                          >
                                              {mode === "sign-in"
                                                  ? t.signUp
                                                  : t.signIn}
                                          </button>
                                      </p>
                                  </>
                              )}
                          </section>
                      </div>,
                      document.body,
                  )
                : null}
        </>
    );
}
