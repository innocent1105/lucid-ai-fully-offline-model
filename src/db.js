import Dexie from 'dexie';

export const db = new Dexie('LucidChatDB');
db.version(1).stores({
  conversations: '++id, title, timestamp, messages' 
});