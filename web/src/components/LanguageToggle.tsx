import { persistLanguage, useLang } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
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
      {/* Like the Flutter app: compact "En"/"አማ" chip on phones (sized only
          as wide as its text), full "English/አማርኛ" selector from tablet up.
          `w-auto` overrides the trigger's default `w-full` stretch. */}
      <SelectTrigger
        className="h-8 w-auto justify-center gap-0.5 rounded-md px-2 text-xs sm:h-9 sm:w-[110px] sm:justify-between sm:gap-1.5 sm:px-3 sm:text-sm"
        aria-label="Language"
      >
        <span aria-hidden className="sm:hidden">{lang === "am" ? "አማ" : "En"}</span>
        <span aria-hidden className="hidden sm:inline">{lang === "am" ? "አማርኛ" : "English"}</span>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="en">English</SelectItem>
        <SelectItem value="am">አማርኛ</SelectItem>
      </SelectContent>
    </Select>
  );
}
