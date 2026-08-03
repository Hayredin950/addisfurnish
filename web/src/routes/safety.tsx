import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, Banknote, Eye, MapPin, PhoneCall, ShieldAlert } from "lucide-react";
import { useLang } from "@/lib/i18n";

export const Route = createFileRoute("/safety")({
  head: () => ({
    meta: [
      { title: "Safety Guidelines — SuqBet" },
      {
        name: "description",
        content:
          "How to buy and sell used furniture safely in Ethiopia: meet in public, inspect before paying, and report suspicious listings.",
      },
      { property: "og:title", content: "Safety Guidelines — SuqBet" },
      {
        property: "og:description",
        content: "Simple rules that keep buyers and sellers safe on SuqBet.",
      },
    ],
  }),
  component: Safety,
});

const RULES = [
  {
    icon: MapPin,
    title: "Meet in a public place",
    body: "Arrange handover at the shop, a busy street or a compound gate. For large items, bring a friend along.",
  },
  {
    icon: Eye,
    title: "Inspect before you pay",
    body: "Check joints, drawers, upholstery and any damage described in the listing. Ask for extra photos first.",
  },
  {
    icon: Banknote,
    title: "Never pay in full up front",
    body: "Pay on delivery or pickup. Be suspicious of anyone asking for a deposit before you see the item.",
  },
  {
    icon: PhoneCall,
    title: "Keep contact on the platform",
    body: "Use in-app messages or the callback request. It keeps a record if something goes wrong.",
  },
  {
    icon: ShieldAlert,
    title: "Check the seller",
    body: "Look for the verified badge, read reviews, and check how long the shop has been active.",
  },
  {
    icon: AlertTriangle,
    title: "Report anything suspicious",
    body: "Prices far below market, refusal to meet, or pressure to pay quickly are red flags. Report the listing.",
  },
];

function Safety() {
  const { t } = useLang();

  const RULES = [
    {
      icon: MapPin,
      title: t("safety.meetTitle"),
      body: t("safety.meetBody"),
    },
    {
      icon: Eye,
      title: t("safety.inspectTitle"),
      body: t("safety.inspectBody"),
    },
    {
      icon: Banknote,
      title: t("safety.payTitle"),
      body: t("safety.payBody"),
    },
    {
      icon: PhoneCall,
      title: t("safety.platformTitle"),
      body: t("safety.platformBody"),
    },
    {
      icon: ShieldAlert,
      title: t("safety.checkTitle"),
      body: t("safety.checkBody"),
    },
    {
      icon: AlertTriangle,
      title: t("safety.reportTitle"),
      body: t("safety.reportBody"),
    },
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 py-14">
      <h1 className="font-display text-3xl font-semibold">{t("safety.title")}</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">{t("safety.subtitle")}</p>

      <div className="mt-10 grid gap-5 sm:grid-cols-2">
        {RULES.map((rule) => (
          <div key={rule.title} className="rounded-lg border bg-card p-5 shadow-soft">
            <rule.icon className="h-5 w-5 text-primary" />
            <h2 className="mt-3 text-base font-semibold">{rule.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{rule.body}</p>
          </div>
        ))}
      </div>

      <div className="mt-10 rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
        <strong className="text-foreground">{t("nav.safety")}:</strong> {t("safety.sellerNote")}
      </div>
    </div>
  );
}
