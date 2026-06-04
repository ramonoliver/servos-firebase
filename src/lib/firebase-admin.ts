import { initializeApp, getApps, getApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

const app = getApps().length === 0 ? initializeApp({ projectId }) : getApp();

export const adminAuth = getAuth(app);
export const adminDb = getFirestore(app);

// Map Supabase table name to Firestore collection name
const COLLECTION_MAPPING: Record<string, string> = {
  churches: "churches",
  users: "users",
  members: "members",
  departments: "ministries",
  schedules: "schedules",
  events: "events",
  cells: "cells",
  kids: "kids",
  notifications: "notifications",
  unavailable_dates: "unavailableDates",
  songs: "songs",
  member_invitations: "invitations",
  onboarding_progress: "onboardingProgress",
  schedule_members: "scheduleMembers",
  schedule_chats: "scheduleChats",
  schedule_attachments: "scheduleAttachments",
  event_reports: "eventReports",
  kids_rooms: "kidsRooms",
  kids_checkins: "kidsCheckins",
  password_reset_tokens: "passwordResetTokens",
  cell_networks: "cellNetworks",
  cell_meetings: "cellMeetings",
  pastoral_notes: "pastoralNotes",
  push_tokens: "pushTokens",
};

function prepareDocumentForWrite(data: any, isUpdate = false) {
  const docData = { ...data };

  if (docData.church_id !== undefined) docData.churchId = docData.church_id;
  if (docData.churchId !== undefined) docData.church_id = docData.churchId;

  const nowStr = new Date().toISOString();

  if (!isUpdate) {
    if (docData.created_at === undefined && docData.createdAt === undefined) {
      docData.created_at = nowStr;
      docData.createdAt = nowStr;
    } else {
      if (docData.created_at !== undefined) docData.createdAt = docData.created_at;
      if (docData.createdAt !== undefined) docData.created_at = docData.createdAt;
    }
  }

  if (docData.updated_at === undefined && docData.updatedAt === undefined) {
    docData.updated_at = nowStr;
    docData.updatedAt = nowStr;
  } else {
    if (docData.updated_at !== undefined) docData.updatedAt = docData.updated_at;
    if (docData.updatedAt !== undefined) docData.updated_at = docData.updatedAt;
  }

  return docData;
}

class AdminQueryBuilder {
  private collectionName: string;
  private filters: Array<{ field: string; operator: any; value: any }> = [];
  private orderings: Array<{ field: string; direction: "asc" | "desc" }> = [];
  private limitVal?: number;
  private isSingle = false;
  private isMaybeSingle = false;
  private writePromise?: Promise<any>;
  private countOptions?: { count?: string; head?: boolean };

  constructor(tableName: string) {
    this.collectionName = COLLECTION_MAPPING[tableName] || tableName;
  }

  select(columns?: string, options?: { count?: string; head?: boolean }) {
    this.countOptions = options;
    return this;
  }

  eq(field: string, value: any) {
    this.filters.push({ field, operator: "==", value });
    return this;
  }

  neq(field: string, value: any) {
    this.filters.push({ field, operator: "!=", value });
    return this;
  }

  not(field: string, operator: string, value: any) {
    if (operator === "is") {
      this.filters.push({ field, operator: "!=", value });
    } else {
      this.filters.push({ field, operator: "!=", value });
    }
    return this;
  }

  in(field: string, values: any[]) {
    this.filters.push({ field, operator: "in", value: values });
    return this;
  }

  gte(field: string, value: any) {
    this.filters.push({ field, operator: ">=", value });
    return this;
  }

  gt(field: string, value: any) {
    this.filters.push({ field, operator: ">", value });
    return this;
  }

  lte(field: string, value: any) {
    this.filters.push({ field, operator: "<=", value });
    return this;
  }

  lt(field: string, value: any) {
    this.filters.push({ field, operator: "<", value });
    return this;
  }

  ilike(field: string, value: any) {
    this.filters.push({ field, operator: "ilike", value });
    return this;
  }

  order(field: string, options?: { ascending?: boolean }) {
    const direction = options?.ascending === false ? "desc" : "asc";
    this.orderings.push({ field, direction });
    return this;
  }

  limit(val: number) {
    this.limitVal = val;
    return this;
  }

  single() {
    this.isSingle = true;
    return this;
  }

  maybeSingle() {
    this.isMaybeSingle = true;
    return this;
  }

  insert(data: any | any[]) {
    const dataList = Array.isArray(data) ? data : [data];
    this.writePromise = (async () => {
      const results = [];
      for (const item of dataList) {
        const prepared = prepareDocumentForWrite(item, false);
        const docId = prepared.id || crypto.randomUUID();
        prepared.id = docId;
        const docRef = adminDb.collection(this.collectionName).doc(docId);
        await docRef.set(prepared);
        results.push(prepared);
      }
      return Array.isArray(data) ? results : results[0];
    })();
    return this;
  }

  update(data: any) {
    this.writePromise = (async () => {
      const prepared = prepareDocumentForWrite(data, true);
      const queryResults = await this.fetchDocs();
      for (const docData of queryResults) {
        const docRef = adminDb.collection(this.collectionName).doc(docData.id);
        await docRef.update(prepared);
      }
      return queryResults.map((item) => ({ ...item, ...prepared }));
    })();
    return this;
  }

  delete() {
    this.writePromise = (async () => {
      const queryResults = await this.fetchDocs();
      for (const docData of queryResults) {
        const docRef = adminDb.collection(this.collectionName).doc(docData.id);
        await docRef.delete();
      }
      return queryResults;
    })();
    return this;
  }

  upsert(data: any, options?: { onConflict: string }) {
    this.writePromise = (async () => {
      const prepared = prepareDocumentForWrite(data, false);
      let docId = prepared.id;

      if (options?.onConflict) {
        const conflictField = options.onConflict;
        const conflictValue = prepared[conflictField];
        if (conflictValue !== undefined) {
          const colRef = adminDb.collection(this.collectionName);
          const snap = await colRef.where(conflictField, "==", conflictValue).get();
          if (!snap.empty) {
            docId = snap.docs[0].id;
          }
        }
      }

      if (!docId) {
        docId = crypto.randomUUID();
      }

      prepared.id = docId;
      const docRef = adminDb.collection(this.collectionName).doc(docId);
      await docRef.set(prepared, { merge: true });
      return prepared;
    })();
    return this;
  }

  private async fetchDocs(): Promise<any[]> {
    let queryRef: any = adminDb.collection(this.collectionName);
    const inMemoryFilters: typeof this.filters = [];

    for (const f of this.filters) {
      if (f.operator === "in") {
        if (!Array.isArray(f.value) || f.value.length === 0) {
          return [];
        }
        if (f.value.length > 30) {
          inMemoryFilters.push(f);
          continue;
        }
      }
      if (f.operator === "ilike") {
        inMemoryFilters.push(f);
        continue;
      }
      if (f.operator === "!=") {
        inMemoryFilters.push(f);
        continue;
      }
      queryRef = queryRef.where(f.field, f.operator, f.value);
    }

    const snap = await queryRef.get();
    let results = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));

    for (const f of inMemoryFilters) {
      if (f.operator === "in") {
        const set = new Set(f.value);
        results = results.filter((item: any) => set.has(item[f.field]));
      } else if (f.operator === "ilike") {
        const queryStr = String(f.value || "").replace(/%/g, "").toLowerCase();
        results = results.filter((item: any) => {
          const val = String(item[f.field] || "").toLowerCase();
          return val.includes(queryStr);
        });
      } else if (f.operator === "!=") {
        results = results.filter((item: any) => item[f.field] !== f.value);
      }
    }

    for (const ord of this.orderings) {
      results.sort((a: any, b: any) => {
        const valA = a[ord.field];
        const valB = b[ord.field];
        if (valA === valB) return 0;
        if (valA === undefined || valA === null) return 1;
        if (valB === undefined || valB === null) return -1;

        let comp = 0;
        if (typeof valA === "string" && typeof valB === "string") {
          comp = valA.localeCompare(valB);
        } else {
          comp = valA < valB ? -1 : 1;
        }
        return ord.direction === "asc" ? comp : -comp;
      });
    }

    if (this.limitVal !== undefined) {
      results = results.slice(0, this.limitVal);
    }

    return results.map((item: any) => {
      const mapped = { ...item };
      if (mapped.churchId !== undefined && mapped.church_id === undefined) mapped.church_id = mapped.churchId;
      if (mapped.createdAt !== undefined && mapped.created_at === undefined) mapped.created_at = mapped.createdAt;
      if (mapped.updatedAt !== undefined && mapped.updated_at === undefined) mapped.updated_at = mapped.updatedAt;
      return mapped;
    });
  }

  async then(onfulfilled?: (value: any) => any, onrejected?: (reason: any) => any) {
    try {
      let data: any = null;
      let count: number | null = null;
      let error: any = null;

      if (this.writePromise) {
        data = await this.writePromise;
      } else {
        const docs = await this.fetchDocs();
        
        if (this.countOptions?.count) {
          count = docs.length;
        }

        if (this.countOptions?.head) {
          data = null;
        } else if (this.isSingle || this.isMaybeSingle) {
          if (docs.length === 0) {
            if (this.isSingle) {
              error = new Error("No rows found");
            } else {
              data = null;
            }
          } else {
            data = docs[0];
          }
        } else {
          data = docs;
        }
      }

      const res = { data, count, error };
      return onfulfilled ? onfulfilled(res) : res;
    } catch (err: any) {
      const res = { data: null, count: null, error: err };
      if (onrejected) return onrejected(res);
      return res;
    }
  }
}

export function getFirebaseAdminClient() {
  return {
    from: (tableName: string) => new AdminQueryBuilder(tableName),
  };
}
