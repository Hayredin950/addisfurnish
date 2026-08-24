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
      {/* Like the Flutter app: compact "En"/"አማ" chip on phones, full
          "English/አማርኛ" selector from tablet size up. */}
      <SelectTrigger
        className="h-8 gap-0.5 rounded-md px-2 text-xs sm:h-9 sm:w-[110px] sm:gap-1.5 sm:px-2.5 sm:text-sm"
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
