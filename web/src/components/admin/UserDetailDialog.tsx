import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  BadgeCheck,
  Ban,
  CalendarDays,
  Check,
  Copy,
  Globe,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Send,
  ShieldCheck,
  Store,
} from "lucide-react";
import type { AdminUser } from "@/lib/marketplace";
import { useLang } from "@/lib/i18n";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/UserAvatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

function languageLabel(code: string) {
  if (code === "am") return "አማርኛ";
  if (code === "en") return "English";
  return code;
}

/** A labeled row: icon · label · value (+ optional badge/extra). */
function DetailRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 py-2">
      <span className="mt-0.5 shrink-0 text-muted-foreground">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <div className="flex flex-wrap items-center gap-1.5 text-sm">{children}</div>
      </div>
    </div>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="rounded p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      title="Copy"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // clipboard unavailable — ignore
        }
      }}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-emerald-600" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="border-b pb-1 pt-2 font-display text-sm font-semibold text-foreground">
      {children}
    </h4>
  );
}

export function UserDetailDialog({
  user,
  open,
  onOpenChange,
}: {
  user: AdminUser | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useLang();
  if (!user) return null;

  const roles = Array.isArray(user.role_names) ? user.role_names : [];
  const adminRole = roles.find((r) =>
    ["admin", "moderator", "verification", "category_manager", "analytics"].includes(r),
  );
  const isAdmin = !!adminRole;
  const name = user.shop_name ?? user.full_name;
  const suspended = !!user.banned_until && new Date(user.banned_until) > new Date();
  const lang = user.preferred_language ? languageLabel(user.preferred_language) : "—";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">{t("admin.userDetails")}</DialogTitle>
        </DialogHeader>

        {/* Identity header */}
        <div className="flex items-center gap-4">
          <UserAvatar name={name} avatarUrl={user.shop_logo_url ?? user.avatar_url} size={56} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate font-display text-lg font-semibold">{name}</p>
              {user.verified ? <BadgeCheck className="h-4 w-4 shrink-0 text-primary" /> : null}
              {isAdmin ? (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                  {user.is_super_admin
                    ? t("admin.roleSuperAdmin")
                    : adminRole === "admin"
                      ? t("admin.roleAdmin")
                      : adminRole === "moderator"
                        ? t("admin.roleModerator")
                        : adminRole === "verification"
                          ? t("admin.roleVerification")
                          : adminRole === "category_manager"
                            ? t("admin.roleCategoryManager")
                            : t("admin.roleAnalytics")}
                </span>
              ) : (
                <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-normal text-muted-foreground">
                  {user.is_seller ? t("admin.roleSeller") : t("admin.roleBuyer")}
                </span>
              )}
            </div>
            {user.email ? (
              <p className="mt-1 flex items-center gap-1 truncate text-sm text-muted-foreground">
                <Mail className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{user.email}</span>
                {user.email_confirmed_at ? (
                  <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                ) : null}
                <CopyButton value={user.email} />
              </p>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">—</p>
            )}
          </div>
        </div>

        {/* Contact */}
        <SectionTitle>{t("admin.contact")}</SectionTitle>
        <div className="divide-y">
          <DetailRow icon={<Phone className="h-4 w-4" />} label={t("admin.phone")}>
            <span>{user.phone ?? "—"}</span>
            {user.phone_verified_at ? (
              <BadgeCheck className="h-3.5 w-3.5 text-emerald-600" />
            ) : null}
            {user.phone ? <CopyButton value={user.phone} /> : null}
          </DetailRow>
          <DetailRow icon={<MessageCircle className="h-4 w-4" />} label={t("admin.whatsapp")}>
            <span>{user.whatsapp ?? "—"}</span>
            {user.whatsapp ? <CopyButton value={user.whatsapp} /> : null}
          </DetailRow>
          <DetailRow icon={<Send className="h-4 w-4" />} label={t("admin.telegram")}>
            <span>{user.telegram ? `@${user.telegram}` : "—"}</span>
            {user.telegram_blocked ? (
              <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
                {t("admin.blocked")}
              </span>
            ) : null}
            {user.telegram ? <CopyButton value={`@${user.telegram}`} /> : null}
          </DetailRow>
          <DetailRow icon={<MapPin className="h-4 w-4" />} label={t("admin.location")}>
            <span>{user.city ?? "—"}</span>
          </DetailRow>
        </div>

        {/* Account */}
        <SectionTitle>{t("admin.account")}</SectionTitle>
        <div className="divide-y">
          <DetailRow icon={<CalendarDays className="h-4 w-4" />} label={t("admin.memberSince")}>
            <span>{timeAgo(user.created_at)}</span>
          </DetailRow>
          <DetailRow icon={<Globe className="h-4 w-4" />} label={t("admin.lastSeen")}>
            <span>{user.last_seen ? timeAgo(user.last_seen) : "—"}</span>
            {user.is_online ? (
              <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                {t("admin.onlineNow")}
              </span>
            ) : null}
          </DetailRow>
          <DetailRow icon={<ShieldCheck className="h-4 w-4" />} label={t("admin.lastSignIn")}>
            <span>{user.last_sign_in_at ? timeAgo(user.last_sign_in_at) : "—"}</span>
          </DetailRow>
          <DetailRow icon={<Globe className="h-4 w-4" />} label={t("admin.language")}>
            <span>{lang}</span>
          </DetailRow>
        </div>

        {/* Shop (sellers only) */}
        {user.is_seller || user.shop_name ? (
          <>
            <SectionTitle>{t("admin.shop")}</SectionTitle>
            <div className="divide-y">
              {user.shop_name ? (
                <DetailRow icon={<Store className="h-4 w-4" />} label={t("admin.shopName")}>
                  <span>{user.shop_name}</span>
                </DetailRow>
              ) : null}
              {user.shop_address ? (
                <DetailRow icon={<MapPin className="h-4 w-4" />} label={t("admin.shopAddress")}>
                  <span>{user.shop_address}</span>
                </DetailRow>
              ) : null}
              {user.registration_number ? (
                <DetailRow icon={<ShieldCheck className="h-4 w-4" />} label={t("admin.regNumber")}>
                  <span>{user.registration_number}</span>
                </DetailRow>
              ) : null}
              {user.shop_description ? (
                <DetailRow icon={<Store className="h-4 w-4" />} label={t("admin.shopDescription")}>
                  <span className="whitespace-pre-line">{user.shop_description}</span>
                </DetailRow>
              ) : null}
              {user.shop_slug ? (
                <div className="pt-2">
                  <Button asChild size="sm" variant="outline">
                    <Link to="/shop/$slug" params={{ slug: user.shop_slug }}>
                      <Store className="mr-1.5 h-3.5 w-3.5" /> {t("listing.visitShop")}
                    </Link>
                  </Button>
                </div>
              ) : null}
            </div>
          </>
        ) : null}

        {/* Bio */}
        {user.bio ? (
          <>
            <SectionTitle>{t("admin.bio")}</SectionTitle>
            <p className="whitespace-pre-line py-2 text-sm text-muted-foreground">{user.bio}</p>
          </>
        ) : null}

        {/* Status */}
        <SectionTitle>{t("admin.status")}</SectionTitle>
        <div className="divide-y">
          {suspended ? (
            <DetailRow
              icon={<Ban className="h-4 w-4 text-destructive" />}
              label={t("admin.status")}
            >
              <span className="font-medium text-destructive">
                {t("admin.suspendedUntil", {
                  date: new Date(user.banned_until!).toLocaleString(),
                })}
                {user.ban_reason ? ` — ${user.ban_reason}` : ""}
              </span>
            </DetailRow>
          ) : (
            <DetailRow
              icon={<ShieldCheck className="h-4 w-4 text-emerald-600" />}
              label={t("admin.status")}
            >
              <span className={cn("font-medium text-emerald-700")}>{t("admin.activeAccount")}</span>
            </DetailRow>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
