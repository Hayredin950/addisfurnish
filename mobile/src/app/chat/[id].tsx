import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { useLang } from "../../lib/lang";
import { useAsync } from "../../hooks/use-async";
import {
  deleteMessage,
  editMessage,
  fetchConversation,
  fetchMessages,
  markConversationRead,
  notifyUser,
  sendMessage,
  uploadListingImage,
} from "../../lib/api";
import { colors, radius, spacing } from "../../lib/theme";
import { imageSource } from "../../lib/storage";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { useToast } from "../../components/Toast";
import { formatBirr, timeAgo } from "../../lib/format";
import { useDraft } from "../../lib/drafts";
import type { Message } from "../../lib/api";

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { t } = useLang();
  const toast = useToast();
  // Unsent text is kept per conversation, so leaving the screen mid-sentence
  // (or the OS reclaiming the app) no longer loses it — item 42.
  const [body, setBody, clearBody] = useDraft(`msg:${id ?? "none"}`);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const listRef = useRef<FlatList>(null);

  const messages = useAsync(() => fetchMessages(id ?? ""), [id]);
  const conversation = useAsync(() => fetchConversation(id ?? ""), [id]);
  const all = useMemo(() => messages.data ?? [], [messages.data]);

  const conv = conversation.data;
  const listing = conv?.listings ?? null;
  /** The other party — buyer sees the seller, seller sees the buyer. */
  const counterpart =
    conv && user
      ? conv.buyer_id === user.id
        ? conv.buyer
        : conv.seller
      : null;

  // Realtime delivery for this conversation — listen to *all* events so edits,
  // soft-deletes and read receipts sync live, not just new sends.
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`chat-${id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${id}`,
        },
        () => messages.refetch(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Mark the counterpart's messages read when the conversation is open.
  useEffect(() => {
    if (!id || !user) return;
    void markConversationRead(id, user.id).then(() => messages.refetch());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user, all.length]);

  useEffect(() => {
    if (all.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [all.length]);

  const pickImage = async () => {
    if (!user || imageBusy) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.7,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets?.[0]) return;
    setPendingImage(result.assets[0].uri);
  };

  const send = async () => {
    const text = body.trim();
    const imgUri = pendingImage;
    if ((!text && !imgUri) || !id || !user) return;
    clearBody();
    setPendingImage(null);
    try {
      let imageUrl: string | null = null;
      if (imgUri) {
        setImageBusy(true);
        imageUrl = await uploadListingImage(user.id, {
          uri: imgUri,
          name: "chat-photo.jpg",
        });
      }
      await sendMessage(id, user.id, text || "", imageUrl);
      if (conv) {
        const recipientId = conv.buyer_id === user.id ? conv.seller_id : conv.buyer_id;
        const me = conv.buyer_id === user.id ? conv.buyer : conv.seller;
        void notifyUser(recipientId, "new_message", {
          title: listing?.title ?? "",
          listingId: listing?.id ?? "",
          conversationId: id,
          senderName: me?.shop_name || me?.full_name || "",
          messagePreview: text || "[Image]",
        });
      }
      messages.refetch();
    } catch (err) {
      // Restore the draft so the send can be retried, and say why it failed —
      // silently putting the text back read as the app losing the message.
      setBody(text);
      setPendingImage(imgUri);
      toast.error(err, t("msgSendFailed"));
    } finally {
      setImageBusy(false);
    }
  };

  const saveEdit = async () => {
    const text = editBody.trim();
    if (!text || !editingId) return;
    try {
      await editMessage(editingId, text);
      setEditingId(null);
      setEditBody("");
      messages.refetch();
    } catch {
      // keep the edit box open on failure
    }
  };

  const confirmDelete = (messageId: string) => setPendingDelete(messageId);

  const runDelete = async () => {
    const id = pendingDelete;
    setPendingDelete(null);
    if (!id) return;
    try {
      await deleteMessage(id);
      messages.refetch();
    } catch (err) {
      toast.error(err, t("oops"));
    }
  };

  const renderBubble = ({ item }: { item: Message }) => {
    const mine = item.sender_id === user?.id;
    const deleted = !!item.deleted_at;
    const isEditing = editingId === item.id;

    return (
      <View style={[styles.bubbleWrap, mine ? styles.mineWrap : styles.theirsWrap]}>
        {isEditing ? (
          <View style={[styles.bubble, styles.editBubble]}>
            <TextInput
              value={editBody}
              onChangeText={setEditBody}
              style={styles.editInput}
              autoFocus
              multiline
              placeholderTextColor={colors.textSoft}
            />
            <View style={styles.editActions}>
              <Pressable onPress={saveEdit} hitSlop={8}>
                <Text style={styles.editSave}>{t("msgSave")}</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setEditingId(null);
                  setEditBody("");
                }}
                hitSlop={8}
              >
                <Text style={styles.editCancel}>{t("cancel")}</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
            {!deleted && item.image_url ? (
              <Image source={imageSource(item.image_url, undefined, 400)} style={styles.msgImage} resizeMode="cover" />
            ) : null}
            {item.body || deleted ? (
              <Text style={[styles.bubbleText, mine && { color: colors.onPrimary }]}>
                {deleted ? t("msgDeleted") : item.body}
              </Text>
            ) : null}
          </View>
        )}
        <View style={[styles.timeRow, mine ? styles.timeRowMine : styles.timeRowTheirs]}>
          {mine && !deleted && !isEditing ? (
            <Ionicons
              name={item.read_at ? "checkmark-done" : "checkmark"}
              size={13}
              color={item.read_at ? colors.info : colors.textSoft}
            />
          ) : null}
          <Text style={[styles.time, mine && { color: colors.textSoft }]}>
            {timeAgo(item.created_at)}
            {item.edited_at && !deleted ? ` · ${t("msgEdited")}` : ""}
          </Text>
          {mine && !deleted && !isEditing ? (
            <View style={styles.bubbleActions}>
              <Pressable
                hitSlop={8}
                onPress={() => {
                  setEditingId(item.id);
                  setEditBody(item.body);
                }}
              >
                <Ionicons name="create-outline" size={13} color={colors.textSoft} />
              </Pressable>
              <Pressable hitSlop={8} onPress={() => confirmDelete(item.id)}>
                <Ionicons name="trash-outline" size={13} color={colors.textSoft} />
              </Pressable>
            </View>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={80}
    >
      <FlatList
        ref={listRef}
        data={all}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: spacing.lg }}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        ListHeaderComponent={
          <View>
            {listing ? (
              <Pressable
                style={styles.listingBanner}
                onPress={() => router.push(`/listing/${listing.id}`)}
              >
                {listing.listing_images?.[0]?.url ? (
                  <Image source={imageSource(listing.listing_images[0].url, undefined, 600)} style={styles.bannerImg} />
                ) : (
                  <View style={[styles.bannerImg, styles.bannerImgEmpty]}>
                    <Text style={styles.bannerEmoji}>🛋️</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.bannerLabel}>{t("msgAboutItem")}</Text>
                  <Text numberOfLines={1} style={styles.bannerTitle}>
                    {listing.title}
                  </Text>
                  <Text style={styles.bannerPrice}>{formatBirr(listing.price)}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textSoft} />
              </Pressable>
            ) : null}
            {/* Direct contact methods for the other party, like the listing page. */}
            {counterpart &&
            (counterpart.phone || counterpart.whatsapp || counterpart.telegram) ? (
              <View style={styles.contactRow}>
                {counterpart.phone ? (
                  <Pressable
                    style={styles.contactChip}
                    onPress={() => Linking.openURL(`tel:${counterpart.phone}`)}
                  >
                    <Ionicons name="call" size={14} color={colors.primary} />
                    <Text style={styles.contactText}>{t("callNow")}</Text>
                  </Pressable>
                ) : null}
                {counterpart.whatsapp ? (
                  <Pressable
                    style={styles.contactChip}
                    onPress={() =>
                      Linking.openURL(
                        `https://wa.me/${(counterpart.whatsapp ?? "").replace(/[^0-9]/g, "")}`,
                      )
                    }
                  >
                    <Ionicons name="logo-whatsapp" size={14} color={colors.success} />
                    <Text style={styles.contactText}>{t("whatsapp")}</Text>
                  </Pressable>
                ) : null}
                {counterpart.telegram ? (
                  <Pressable
                    style={styles.contactChip}
                    onPress={() =>
                      Linking.openURL(`https://t.me/${(counterpart.telegram ?? "").replace("@", "")}`)
                    }
                  >
                    <Ionicons name="paper-plane" size={13} color={colors.info} />
                    <Text style={styles.contactText}>{t("telegram")}</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </View>
        }
        renderItem={renderBubble}
      />
      {pendingImage ? (
        <View style={{ paddingHorizontal: spacing.lg, paddingBottom: 6 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Image source={{ uri: pendingImage }} style={{ width: 48, height: 48, borderRadius: 8 }} />
            <Text style={{ flex: 1, fontSize: 12, color: colors.textMuted }}>{t("imageAttached")}</Text>
            <Pressable onPress={() => setPendingImage(null)} hitSlop={8}>
              <Ionicons name="close-circle" size={20} color={colors.textMuted} />
            </Pressable>
          </View>
        </View>
      ) : null}
      <View style={styles.inputBar}>
        <Pressable style={styles.imgBtn} onPress={pickImage} disabled={imageBusy}>
          {imageBusy ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Ionicons name="image-outline" size={20} color={colors.textMuted} />
          )}
        </Pressable>
        <TextInput
          value={body}
          onChangeText={setBody}
          placeholder={t("msgWrite")}
          placeholderTextColor={colors.textSoft}
          style={styles.input}
          multiline
        />
        <Pressable
          style={[styles.sendBtn, (!body.trim() && !pendingImage) && { opacity: 0.4 }]}
          onPress={send}
          disabled={!body.trim() && !pendingImage}
        >
          <Ionicons name="send" size={18} color="#fff" />
        </Pressable>
      </View>
      <ConfirmDialog
        visible={!!pendingDelete}
        title={t("msgDelete")}
        message={t("msgDeleteConfirm")}
        confirmLabel={t("msgDelete")}
        cancelLabel={t("cancel")}
        destructive
        onConfirm={runDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  listingBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
    marginBottom: 10,
  },
  contactRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 14,
  },
  contactChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.card,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  contactText: { fontSize: 12, color: colors.text, fontWeight: "600" },
  bannerImg: { width: 44, height: 44, borderRadius: radius.md },
  bannerImgEmpty: { backgroundColor: colors.secondary, alignItems: "center", justifyContent: "center" },
  bannerEmoji: { fontSize: 20 },
  bannerLabel: { fontSize: 10, color: colors.textSoft, textTransform: "uppercase", letterSpacing: 0.4 },
  bannerTitle: { fontSize: 14, fontWeight: "600", color: colors.text, marginTop: 1 },
  bannerPrice: { fontSize: 12.5, color: colors.primary, fontWeight: "700", marginTop: 1 },
  bubbleWrap: { marginBottom: 12, maxWidth: "82%" },
  mineWrap: { alignSelf: "flex-end", alignItems: "flex-end" },
  theirsWrap: { alignSelf: "flex-start", alignItems: "flex-start" },
  bubble: { borderRadius: radius.lg, paddingHorizontal: 14, paddingVertical: 10 },
  mine: { backgroundColor: colors.primary },
  theirs: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  editBubble: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.primary, minWidth: 200 },
  editInput: { fontSize: 14, color: colors.text, minHeight: 40, padding: 0 },
  editActions: { flexDirection: "row", gap: 16, marginTop: 8, justifyContent: "flex-end" },
  editSave: { fontSize: 13, color: colors.primary, fontWeight: "700" },
  editCancel: { fontSize: 13, color: colors.textMuted },
  bubbleText: { fontSize: 14, color: colors.text, lineHeight: 20 },
  timeRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4, marginHorizontal: 4 },
  timeRowMine: { justifyContent: "flex-end" },
  timeRowTheirs: { justifyContent: "flex-start" },
  time: { fontSize: 10, color: colors.textSoft },
  bubbleActions: { flexDirection: "row", gap: 8, marginLeft: 6 },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    padding: spacing.md,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  input: {
    flex: 1,
    backgroundColor: colors.secondary,
    borderRadius: radius.xl,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
    maxHeight: 110,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  imgBtn: {
    width: 42,
    height: 42,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  msgImage: {
    width: 220,
    height: 160,
    borderRadius: radius.md,
    marginBottom: 4,
  },
});
