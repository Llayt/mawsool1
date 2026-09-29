import type { Agency, Service, PolicyClause, Policy } from './types';

export interface ChangedItem {
  clauseNumber: string;
  oldText: string;
  newText: string;
  summary: string;
  changeType: 'modified' | 'added' | 'removed';
}

export interface ImpactAnalysisResult {
  changedItems: ChangedItem[];
  affectedServices: AffectedService[];
  affectedAgencies: AffectedAgency[];
  overallSummary: string;
  approvedMatch?: boolean;
  caseTitle?: string;
  affectedSystems?: string[];
  sources?: Array<{ label: string; url: string }>;
  conflicts?: Array<{ rule: string; conflict: string }>;
  retrievedRules?: string[];
}

export interface AffectedService {
  id: string;
  name: string;
  agencyId: string;
  agencyName: string;
  reason: string;
  relationType?: string;
  statusNote?: string;
}

export interface AffectedAgency {
  id: string;
  name: string;
  reason: string;
  serviceCount: number;
}

export interface ProposedTask {
  to_agency_id: string;
  service_id: string | null;
  title: string;
  description: string;
  reason: string;
  clause_id: string | null;
}

function normalizeText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/[\u064B-\u0652]/g, '')
    .trim();
}

function tokenize(text: string): string[] {
  return normalizeText(text)
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function findChangedSentences(oldText: string, newText: string): ChangedItem[] {
  const oldSentences = oldText.split(/[.،؛\n]+/).map((s) => s.trim()).filter(Boolean);
  const newSentences = newText.split(/[.،؛\n]+/).map((s) => s.trim()).filter(Boolean);
  const items: ChangedItem[] = [];

  const maxLen = Math.max(oldSentences.length, newSentences.length);
  for (let i = 0; i < maxLen; i++) {
    const old = oldSentences[i] || '';
    const news = newSentences[i] || '';
    if (old === news) continue;

    let changeType: ChangedItem['changeType'] = 'modified';
    if (!old) changeType = 'added';
    else if (!news) changeType = 'removed';

    const summary = generateChangeSummary(old, news, changeType);
    items.push({
      clauseNumber: String(i + 1),
      oldText: old,
      newText: news,
      summary,
      changeType,
    });
  }
  return items;
}

function generateChangeSummary(old: string, news: string, type: ChangedItem['changeType']): string {
  if (type === 'added') return `إضافة نص جديد: "${news.slice(0, 80)}${news.length > 80 ? '...' : ''}"`;
  if (type === 'removed') return `حذف: "${old.slice(0, 80)}${old.length > 80 ? '...' : ''}"`;

  const oldTokens = new Set(tokenize(old));
  const newTokens = new Set(tokenize(news));
  const added = [...newTokens].filter((t) => !oldTokens.has(t));
  const removed = [...oldTokens].filter((t) => !newTokens.has(t));

  const parts: string[] = [];
  if (removed.length > 0) parts.push(`إلغاء: ${removed.slice(0, 5).join('، ')}`);
  if (added.length > 0) parts.push(`إضافة: ${added.slice(0, 5).join('، ')}`);

  if (parts.length === 0) return 'تعديل في الصياغة';
  return parts.join(' | ');
}

export function analyzeImpact(
  oldText: string,
  newText: string,
  allServices: Service[],
  allAgencies: Agency[],
  allClauses: PolicyClause[],
  policyId: string | null,
): ImpactAnalysisResult {
  const changedItems = findChangedSentences(oldText, newText);
  const combinedOld = normalizeText(oldText);
  const combinedNew = normalizeText(newText);
  const allTokens = new Set([...tokenize(combinedOld), ...tokenize(combinedNew)]);

  const matchedServices = new Map<string, AffectedService>();
  for (const svc of allServices) {
    if (policyId && svc.policy_id !== policyId) {
      const keywords = svc.keywords || [];
      const hasOverlap = keywords.some((kw) =>
        allTokens.has(normalizeText(kw)) || combinedNew.includes(normalizeText(kw)),
      );
      if (!hasOverlap) continue;
    }

    const agency = allAgencies.find((a) => a.id === svc.agency_id);
    const keywords = svc.keywords || [];
    const matchedKeywords = keywords.filter((kw) =>
      combinedNew.includes(normalizeText(kw)) || allTokens.has(normalizeText(kw)),
    );

    if (matchedKeywords.length > 0 || (policyId && svc.policy_id === policyId)) {
      matchedServices.set(svc.id, {
        id: svc.id,
        name: svc.name,
        agencyId: svc.agency_id || '',
        agencyName: agency?.name || 'جهة غير محددة',
        reason: matchedKeywords.length > 0
          ? `تطابق في الكلمات المفتاحية: ${matchedKeywords.slice(0, 3).join('، ')}`
          : 'الخدمة مرتبطة بهذه السياسة',
      });
    }
  }

  const agencyMap = new Map<string, AffectedAgency>();
  for (const svc of matchedServices.values()) {
    const existing = agencyMap.get(svc.agencyId);
    if (existing) {
      existing.serviceCount++;
    } else {
      const agency = allAgencies.find((a) => a.id === svc.agencyId);
      agencyMap.set(svc.agencyId, {
        id: svc.agencyId,
        name: agency?.name || svc.agencyName,
        reason: `الجهة المسؤولة عن ${svc.name}`,
        serviceCount: 1,
      });
    }
  }

  const overallSummary = generateOverallSummary(changedItems, matchedServices.size, agencyMap.size);

  return {
    changedItems,
    affectedServices: [...matchedServices.values()],
    affectedAgencies: [...agencyMap.values()],
    overallSummary,
  };
}

function generateOverallSummary(changedItems: ChangedItem[], serviceCount: number, agencyCount: number): string {
  const added = changedItems.filter((c) => c.changeType === 'added').length;
  const removed = changedItems.filter((c) => c.changeType === 'removed').length;
  const modified = changedItems.filter((c) => c.changeType === 'modified').length;

  const parts: string[] = [];
  if (modified > 0) parts.push(`${modified} بند معدّل`);
  if (added > 0) parts.push(`${added} بند مضاف`);
  if (removed > 0) parts.push(`${removed} بند محذوف`);

  const changeSummary = parts.length > 0 ? parts.join('، ') : 'تغييرات في الصياغة';
  return `يشمل التحديث ${changeSummary}، ويؤثر على ${serviceCount} خدمة و${agencyCount} جهة حكومية.`;
}

export function proposeTasks(
  analysis: ImpactAnalysisResult,
  fromAgencyId: string,
  policyId: string | null,
  clauses: PolicyClause[],
): ProposedTask[] {
  const tasks: ProposedTask[] = [];

  for (const agency of analysis.affectedAgencies) {
    if (agency.id === fromAgencyId) continue;

    const agencyServices = analysis.affectedServices.filter((s) => s.agencyId === agency.id);
    const service = agencyServices[0];

    const matchingClause = clauses.find((c) => {
      if (!c.new_text) return false;
      return analysis.changedItems.some((ci) => ci.newText && c.new_text?.includes(ci.newText.slice(0, 20)));
    });

    tasks.push({
      to_agency_id: agency.id,
      service_id: service?.id || null,
      title: `تحديث اشتراطات: ${service?.name || agency.name}`,
      description: `بناءً على تحديث السياسة، يلزم تحديث الإجراءات المتعلقة بـ ${service?.name || 'الخدمات المرتبطة'}. ${analysis.overallSummary}`,
      reason: agency.reason,
      clause_id: matchingClause?.id || null,
    });
  }

  return tasks;
}

export interface PolicyVersionInfo {
  policy: Policy;
  clauses: PolicyClause[];
}

export function getLatestPublishedPolicies(
  policies: Policy[],
  clauses: PolicyClause[],
): PolicyVersionInfo[] {
  return policies
    .filter((p) => p.status === 'published')
    .map((policy) => ({
      policy,
      clauses: clauses.filter((c) => c.policy_id === policy.id),
    }));
}
