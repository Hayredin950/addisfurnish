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
      {/* Short Flutter-style label everywhere: "En" / "አማ". */}
      <SelectTrigger className="h-9 gap-1 px-2.5" aria-label="Language">
        {lang === "am" ? "አማ" : "En"}
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="en">English</SelectItem>
        <SelectItem value="am">አማርኛ</SelectItem>
      </SelectContent>
    </Select>
  );
}
