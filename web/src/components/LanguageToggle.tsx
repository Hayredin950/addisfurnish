import { persistLanguage, useLang } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Compact English/አማርኛ language switcher for the header. */
export function LanguageToggle() {
  const { lang, setLang } = useLang();
  const { user } = useAuth();

  return (
    <Select
      value={lang}
      onValueChange={(v) => {
        setLang(v as "en" | "am");
        persistLanguage(user?.id, v as "en" | "am");
      }}
    >
      {/* Phones show the Flutter-app-style short label ("En"/"አማ"); `sm` and
          up show the full name. */}
      <SelectTrigger
        className="h-9 gap-1 px-2.5 sm:w-[110px] sm:px-2.5"
        aria-label="Language"
      >
        <span className="sm:hidden">{lang === "am" ? "አማ" : "En"}</span>
        <span className="hidden sm:inline-flex">
          <SelectValue />
        </span>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="en">English</SelectItem>
        <SelectItem value="am">አማርኛ</SelectItem>
      </SelectContent>
    </Select>
  );
}
