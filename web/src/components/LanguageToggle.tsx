import { persistLanguage, useLang } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";

/**
 * Language switcher for the header, like the Flutter app: phones see a compact
 * "En"/"አማ" chip, larger screens the full "English"/"አማርኛ". Exactly one
 * text node is ever rendered — the label is chosen from the viewport width,
 * so the two can never appear together. Dropdown keeps the full names.
 */
export function LanguageToggle() {
  const { lang, setLang } = useLang();
  const { user } = useAuth();
  const isMobile = useIsMobile();

  const label = lang === "am" ? (isMobile ? "አማ" : "አማርኛ") : isMobile ? "En" : "English";

  return (
    <Select
      value={lang}
      onValueChange={(v) => {
        setLang(v as "en" | "am");
        persistLanguage(user?.id, v as "en" | "am");
      }}
    >
      <SelectTrigger
        className={
          isMobile ? "h-8 w-auto gap-0.5 rounded-md px-2 text-xs" : "h-9 gap-1.5 rounded-md px-3 text-sm"
        }
        aria-label="Language"
      >
        {label}
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="en">English</SelectItem>
        <SelectItem value="am">አማርኛ</SelectItem>
      </SelectContent>
    </Select>
  );
}
