import { EventEmitter } from 'events';
import { Browser, Page } from 'puppeteer';
import { VenomConfig } from '../config';
import { Logger } from '../utils/logger';
import * as qrTerminal from 'qrcode-terminal';

/**
 * Connection states
 */
export enum ConnectionState {
  OPENING = 'OPENING',
  PAIRING = 'PAIRING',
  UNPAIRED = 'UNPAIRED',
  UNPAIRED_IDLE = 'UNPAIRED_IDLE',
  CONNECTED = 'CONNECTED',
  TIMEOUT = 'TIMEOUT',
  CONFLICT = 'CONFLICT',
  UNLAUNCHED = 'UNLAUNCHED',
  PROXYBLOCK = 'PROXYBLOCK',
  TOS_BLOCK = 'TOS_BLOCK',
  SMB_TOS_BLOCK = 'SMB_TOS_BLOCK',
  DEPRECATED_VERSION = 'DEPRECATED_VERSION',
}

/**
 * Message ACK types
 */
export enum AckType {
  MD_DOWNGRADE = -7,
  INACTIVE = -6,
  CONTENT_UNUPLOADABLE = -5,
  CONTENT_TOO_BIG = -4,
  CONTENT_GONE = -3,
  EXPIRED = -2,
  FAILED = -1,
  CLOCK = 0,
  SENT = 1,
  RECEIVED = 2,
  READ = 3,
  PLAYED = 4,
}

/**
 * Message interface
 */
export interface VenomMessage {
  id: string;
  body: string;
  type: string;
  from: string;
  to: string;
  author?: string;
  isGroupMsg: boolean;
  isMedia: boolean;
  isMMS: boolean;
  fromMe: boolean;
  timestamp: number;
  hasQuotedMsg: boolean;
  quotedMsgId?: string;
  mimetype?: string;
  mediaKey?: string;
  directPath?: string;
  caption?: string;
  chat?: any;
  sender?: any;
}

/**
 * Venom Client — main interface for WhatsApp automation
 */
export class VenomClient extends EventEmitter {
  private browser: Browser;
  private page: Page;
  private config: VenomConfig;
  private log: ReturnType<typeof Logger.get>;
  private _ready = false;
  private _connected = false;

  constructor(browser: Browser, page: Page, config: VenomConfig) {
    super();
    this.browser = browser;
    this.page = page;
    this.config = config;
    this.log = Logger.get(config.session);
  }

  /** Whether the client is ready to send/receive */
  get isReady(): boolean {
    return this._ready;
  }

  /** Whether the client is connected */
  get isConnected(): boolean {
    return this._connected;
  }

  /** The Puppeteer page instance */
  get pupPage(): Page {
    return this.page;
  }

  /** The Puppeteer browser instance */
  get pupBrowser(): Browser {
    return this.browser;
  }

  // ─── Internal ────────────────────────────────────────────

  /** @internal Mark client as ready */
  _setReady(ready: boolean): void {
    this._ready = ready;
    this._connected = ready;
  }

  // ─── Sending Messages ────────────────────────────────────

  /** Send a text message */
  async sendText(chatId: string, text: string, options?: { quotedMsgId?: string; mentions?: string[] }): Promise<any> {
    return this.page.evaluate(
      (id, msg, opts) => (window as any).WWebJS.sendTextMessage(id, msg, opts),
      chatId, text, options || {}
    );
  }

  /** Send image from file path or URL */
  async sendImage(chatId: string, imagePath: string, caption?: string): Promise<any> {
    return this.page.evaluate(
      (id, img, cap) => (window as any).WWebJS.sendMediaMessage(id, {
        type: 'image',
        media: img,
        caption: cap,
      }),
      chatId, imagePath, caption
    );
  }

  /** Send image from base64 */
  async sendImageFromBase64(chatId: string, base64: string, filename?: string, caption?: string): Promise<any> {
    return this.page.evaluate(
      (id, b64, name, cap) => (window as any).WWebJS.sendMediaMessage(id, {
        type: 'image',
        media: b64,
        filename: name,
        caption: cap,
      }),
      chatId, base64, filename, caption
    );
  }

  /** Send file from path */
  async sendFile(chatId: string, filePath: string, filename?: string, caption?: string): Promise<any> {
    return this.page.evaluate(
      (id, file, name, cap) => (window as any).WWebJS.sendMediaMessage(id, {
        type: 'document',
        media: file,
        filename: name,
        caption: cap,
      }),
      chatId, filePath, filename, caption
    );
  }

  /** Send file from base64 */
  async sendFileFromBase64(chatId: string, base64: string, filename: string, caption?: string): Promise<any> {
    return this.page.evaluate(
      (id, b64, name, cap) => (window as any).WWebJS.sendMediaMessage(id, {
        type: 'document',
        media: b64,
        filename: name,
        caption: cap,
      }),
      chatId, base64, filename, caption
    );
  }

  /** Send audio/voice message */
  async sendVoice(chatId: string, audioPath: string): Promise<any> {
    return this.page.evaluate(
      (id, audio) => (window as any).WWebJS.sendMediaMessage(id, {
        type: 'audio',
        media: audio,
        isPtt: true,
      }),
      chatId, audioPath
    );
  }

  /** Send audio from base64 */
  async sendVoiceBase64(chatId: string, base64: string): Promise<any> {
    return this.page.evaluate(
      (id, b64) => (window as any).WWebJS.sendMediaMessage(id, {
        type: 'audio',
        media: b64,
        isPtt: true,
      }),
      chatId, base64
    );
  }

  /** Send location */
  async sendLocation(chatId: string, lat: string, lng: string, name?: string): Promise<any> {
    return this.page.evaluate(
      (id, latitude, longitude, locationName) => (window as any).WWebJS.sendMediaMessage(id, {
        type: 'location',
        lat: latitude,
        lng: longitude,
        name: locationName,
      }),
      chatId, lat, lng, name
    );
  }

  /** Send contact card */
  async sendContactVcard(chatId: string, contactId: string, name?: string): Promise<any> {
    return this.page.evaluate(
      (id, contact, contactName) => (window as any).WWebJS.sendMediaMessage(id, {
        type: 'vcard',
        contactId: contact,
        contactName: contactName,
      }),
      chatId, contactId, name
    );
  }

  /** Send multiple contact cards */
  async sendContactVcardList(chatId: string, contactIds: string[]): Promise<any> {
    return this.page.evaluate(
      (id, contacts) => (window as any).WWebJS.sendMediaMessage(id, {
        type: 'vcard_list',
        contactIds: contacts,
      }),
      chatId, contactIds
    );
  }

  /** Send poll */
  async sendPollCreation(chatId: string, poll: { name: string; options: { name: string }[]; selectableOptionsCount?: number }): Promise<any> {
    return this.page.evaluate(
      (id, pollData) => (window as any).WWebJS.sendMediaMessage(id, {
        type: 'poll',
        poll: pollData,
      }),
      chatId, poll
    );
  }

  /** Reply to a message */
  async reply(chatId: string, text: string, quotedMsgId: string): Promise<any> {
    return this.sendText(chatId, text, { quotedMsgId });
  }

  /** Forward messages */
  async forwardMessages(chatId: string, messageIds: string[]): Promise<any> {
    return this.page.evaluate(
      (id, ids) => (window as any).WWebJS.forwardMessages?.(id, ids),
      chatId, messageIds
    );
  }

  // ─── Retrieving Data ────────────────────────────────────

  /** Get all chats */
  async getAllChats(): Promise<any[]> {
    return this.page.evaluate(() => (window as any).WWebJS.getAllChats());
  }

  /** Get all contacts */
  async getAllContacts(): Promise<any[]> {
    return this.page.evaluate(() => (window as any).WWebJS.getAllContacts());
  }

  /** Get chat by ID */
  async getChat(chatId: string): Promise<any> {
    return this.page.evaluate((id) => (window as any).WWebJS.getChat(id), chatId);
  }

  /** Get messages in chat */
  async getAllMessagesInChat(chatId: string, count = 50): Promise<VenomMessage[]> {
    return this.page.evaluate(
      (id, n) => (window as any).WWebJS.getMessages(id, n),
      chatId, count
    );
  }

  /** Get profile picture URL */
  async getProfilePicFromServer(chatId: string): Promise<string | null> {
    return this.page.evaluate(
      (id) => (window as any).WWebJS.getProfilePic(id),
      chatId
    );
  }

  /** Check if number exists on WhatsApp */
  async checkNumberStatus(chatId: string): Promise<{ exists: boolean; jid?: string }> {
    return this.page.evaluate(
      (id) => (window as any).WWebJS.checkNumberStatus(id),
      chatId
    );
  }

  /** Get block list */
  async getBlockList(): Promise<string[]> {
    return this.page.evaluate(() => {
      const BlockStore = (window as any).require?.('WAWebBlocklistCollection');
      return BlockStore?.getModelsArray?.()?.map((b: any) => b.id?.toString?.()) || [];
    });
  }

  /** Get mute list */
  async getListMute(): Promise<any[]> {
    return this.page.evaluate(() => {
      const ChatStore = (window as any).require?.('WAWebChatCollection');
      return ChatStore?.getModelsArray?.()
        ?.filter((c: any) => c.mute?.expiration > 0)
        ?.map((c: any) => ({ id: c.id?.toString?.(), mute: c.mute })) || [];
    });
  }

  /** Get connection state */
  async getConnectionState(): Promise<string> {
    return this.page.evaluate(() => {
      const Socket = (window as any).require?.('WAWebSocketModel')?.Socket;
      return Socket?.state || 'UNKNOWN';
    });
  }

  /** Get battery level */
  async getBatteryLevel(): Promise<number | null> {
    return this.page.evaluate(() => (window as any).WWebJS.getBatteryLevel());
  }

  /** Is connected (async - checks WhatsApp Web state) */
  async isConnectedAsync(): Promise<boolean> {
    const state = await this.getConnectionState();
    return state === 'CONNECTED';
  }

  /** Get WhatsApp Web version */
  async getWAVersion(): Promise<string | null> {
    return this.page.evaluate(() => (window as any).WWebJS.getWAVersion());
  }

  /** Get host device info */
  async getHostDevice(): Promise<any> {
    return this.page.evaluate(() => (window as any).WWebJS.getHostDevice());
  }

  // ─── Group Management ────────────────────────────────────

  /** Get group members */
  async getGroupMembers(groupId: string): Promise<any[]> {
    return this.page.evaluate(
      (id) => (window as any).WWebJS.getGroupMembers(id),
      groupId
    );
  }

  /** Get group admins */
  async getGroupAdmins(groupId: string): Promise<string[]> {
    return this.page.evaluate(
      (id) => (window as any).WWebJS.getGroupAdmins(id),
      groupId
    );
  }

  /** Get group invite link */
  async getGroupInviteLink(groupId: string): Promise<string | null> {
    return this.page.evaluate(async (id) => {
      const GroupInvite = (window as any).require?.('WAWebGroupInviteAction');
      return GroupInvite?.queryGroupInviteCode?.(id);
    }, groupId);
  }

  /** Create group */
  async createGroup(name: string, participants: string[]): Promise<any> {
    return this.page.evaluate(
      async (groupName, members) => {
        const CreateGroup = (window as any).require?.('WAWebGroupCreateAction');
        return CreateGroup?.createGroup?.(groupName, members);
      },
      name, participants
    );
  }

  /** Add participant to group */
  async addParticipant(groupId: string, participantId: string): Promise<any> {
    return this.page.evaluate(
      async (gid, pid) => {
        const GroupParticipants = (window as any).require?.('WAWebGroupParticipantsAction');
        return GroupParticipants?.addParticipants?.(gid, [pid]);
      },
      groupId, participantId
    );
  }

  /** Remove participant from group */
  async removeParticipant(groupId: string, participantId: string): Promise<any> {
    return this.page.evaluate(
      async (gid, pid) => {
        const GroupParticipants = (window as any).require?.('WAWebGroupParticipantsAction');
        return GroupParticipants?.removeParticipants?.(gid, [pid]);
      },
      groupId, participantId
    );
  }

  /** Promote participant to admin */
  async promoteParticipant(groupId: string, participantId: string): Promise<any> {
    return this.page.evaluate(
      async (gid, pid) => {
        const GroupParticipants = (window as any).require?.('WAWebGroupParticipantsAction');
        return GroupParticipants?.promoteParticipants?.(gid, [pid]);
      },
      groupId, participantId
    );
  }

  /** Demote admin participant */
  async demoteParticipant(groupId: string, participantId: string): Promise<any> {
    return this.page.evaluate(
      async (gid, pid) => {
        const GroupParticipants = (window as any).require?.('WAWebGroupParticipantsAction');
        return GroupParticipants?.demoteParticipants?.(gid, [pid]);
      },
      groupId, participantId
    );
  }

  /** Leave group */
  async leaveGroup(groupId: string): Promise<any> {
    return this.page.evaluate(async (id) => {
      const LeaveGroup = (window as any).require?.('WAWebGroupLeaveAction');
      return LeaveGroup?.leaveGroup?.(id);
    }, groupId);
  }

  /** Set group description */
  async setGroupDescription(groupId: string, description: string): Promise<any> {
    return this.page.evaluate(
      async (id, desc) => {
        const GroupDesc = (window as any).require?.('WAWebGroupDescAction');
        return GroupDesc?.setGroupDescription?.(id, desc);
      },
      groupId, description
    );
  }

  /** Join group via invite link */
  async joinGroup(inviteCode: string): Promise<any> {
    return this.page.evaluate(async (code) => {
      const JoinGroup = (window as any).require?.('WAWebGroupJoinAction');
      return JoinGroup?.joinGroupViaInvite?.(code);
    }, inviteCode);
  }

  // ─── Profile & Device ────────────────────────────────────

  /** Set profile status/about */
  async setProfileStatus(status: string): Promise<any> {
    return this.page.evaluate(
      (s) => (window as any).WWebJS.setProfileStatus(s),
      status
    );
  }

  /** Set profile name */
  async setProfileName(name: string): Promise<any> {
    return this.page.evaluate(
      (n) => (window as any).WWebJS.setProfileName(n),
      name
    );
  }

  /** Set profile picture */
  async setProfilePic(imagePath: string): Promise<any> {
    return this.page.evaluate(async (img) => {
      const ProfilePic = (window as any).require?.('WAWebSetProfilePicAction');
      return ProfilePic?.setProfilePic?.(img);
    }, imagePath);
  }

  // ─── Chat Actions ────────────────────────────────────────

  /** Send seen receipt */
  async sendSeen(chatId: string): Promise<any> {
    return this.page.evaluate(
      (id) => (window as any).WWebJS.sendSeen(id),
      chatId
    );
  }

  /** Start typing indicator */
  async startTyping(chatId: string): Promise<any> {
    return this.page.evaluate(
      (id) => (window as any).WWebJS.setTyping(id, true),
      chatId
    );
  }

  /** Stop typing indicator */
  async stopTyping(chatId: string): Promise<any> {
    return this.page.evaluate(
      (id) => (window as any).WWebJS.setTyping(id, false),
      chatId
    );
  }

  /** Delete chat */
  async deleteChat(chatId: string): Promise<any> {
    return this.page.evaluate(async (id) => {
      const ChatStore = (window as any).require?.('WAWebChatCollection');
      const DeleteAction = (window as any).require?.('WAWebDeleteChatAction');
      const chat = ChatStore?.get(id);
      if (chat) return DeleteAction?.deleteChat?.(chat);
    }, chatId);
  }

  /** Clear chat messages */
  async clearChatMessages(chatId: string): Promise<any> {
    return this.page.evaluate(async (id) => {
      const ChatStore = (window as any).require?.('WAWebChatCollection');
      const ClearAction = (window as any).require?.('WAWebClearChatAction');
      const chat = ChatStore?.get(id);
      if (chat) return ClearAction?.clearChat?.(chat);
    }, chatId);
  }

  /** Archive/unarchive chat */
  async archiveChat(chatId: string, archive = true): Promise<any> {
    return this.page.evaluate(
      async (id, shouldArchive) => {
        const ChatStore = (window as any).require?.('WAWebChatCollection');
        const ArchiveAction = (window as any).require?.('WAWebArchiveChatAction');
        const chat = ChatStore?.get(id);
        if (chat) return ArchiveAction?.archiveChat?.(chat, shouldArchive);
      },
      chatId, archive
    );
  }

  /** Pin/unpin chat */
  async pinChat(chatId: string, pin: boolean): Promise<any> {
    return this.page.evaluate(
      async (id, shouldPin) => {
        const ChatStore = (window as any).require?.('WAWebChatCollection');
        const PinAction = (window as any).require?.('WAWebPinChatAction');
        const chat = ChatStore?.get(id);
        if (chat) return PinAction?.pinChat?.(chat, shouldPin);
      },
      chatId, pin
    );
  }

  /** Block contact */
  async blockContact(chatId: string): Promise<any> {
    return this.page.evaluate(
      (id) => (window as any).WWebJS.blockContact(id),
      chatId
    );
  }

  /** Unblock contact */
  async unblockContact(chatId: string): Promise<any> {
    return this.page.evaluate(
      (id) => (window as any).WWebJS.unblockContact(id),
      chatId
    );
  }

  /** Delete messages */
  async deleteMessage(chatId: string, messageIds: string[], deleteForEveryone = false): Promise<any> {
    return this.page.evaluate(
      (id, ids, everyone) => (window as any).WWebJS.deleteMessage(id, ids, everyone),
      chatId, messageIds, deleteForEveryone
    );
  }

  /** Mute chat */
  async sendMute(chatId: string, duration: number, unit: 'hours' | 'minutes' | 'year' = 'hours'): Promise<any> {
    const ms = unit === 'minutes' ? duration * 60000 : unit === 'hours' ? duration * 3600000 : duration * 31536000000;
    return this.page.evaluate(
      async (id, muteMs) => {
        const ChatStore = (window as any).require?.('WAWebChatCollection');
        const MuteAction = (window as any).require?.('WAWebMuteChatAction');
        const chat = ChatStore?.get(id);
        if (chat) return MuteAction?.muteChat?.(chat, muteMs);
      },
      chatId, ms
    );
  }

  // ─── Session Control ─────────────────────────────────────

  /** Take over session (use here) */
  async useHere(): Promise<void> {
    await this.page.evaluate(() => {
      const Socket = (window as any).require?.('WAWebSocketModel')?.Socket;
      Socket?.takeover?.();
    });
  }

  /** Logout */
  async logout(): Promise<void> {
    await this.page.evaluate(() => {
      const Cmd = (window as any).require?.('WAWebCmd')?.Cmd;
      Cmd?.logout?.();
    });
  }

  /** Close the client and browser */
  async close(): Promise<void> {
    this._ready = false;
    this._connected = false;

    try {
      await this.browser.close();
    } catch {}

    this.emit('disconnected', 'CLOSED');
    this.log.info('Client closed');
  }

  // ─── Event Helpers ───────────────────────────────────────

  /** Listen for incoming messages */
  onMessage(handler: (message: VenomMessage) => void): this {
    return this.on('message', handler);
  }

  /** Listen for all messages (including sent) */
  onAnyMessage(handler: (message: VenomMessage) => void): this {
    return this.on('message_create', handler);
  }

  /** Listen for message status (ack) changes */
  onAck(handler: (message: VenomMessage, ack: AckType) => void): this {
    return this.on('message_ack', handler);
  }

  /** Listen for connection state changes */
  onStateChange(handler: (state: ConnectionState) => void): this {
    return this.on('change_state', handler);
  }

  /** Listen for incoming calls */
  onIncomingCall(handler: (call: any) => void): this {
    return this.on('incoming_call', handler);
  }

  /** Listen for group participant changes */
  onAddedToGroup(handler: (chat: any) => void): this {
    return this.on('group_join', handler);
  }
}
