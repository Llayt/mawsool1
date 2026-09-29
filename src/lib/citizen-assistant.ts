import type { Service, Agency, Policy, PolicyClause } from './types';

export interface AssistantResult {
  reply: string;
  steps: ServiceStep[];
  followUpQuestion?: string;
  missingInfo?: string;
}

export interface ServiceStep {
  serviceName: string;
  agencyName: string;
  reason: string;
  requirements: string[];
  link: string | null;
  policyTitle: string;
  policyVersion: string;
}

function normalizeArabic(text: string): string {
  return text
    .replace(/[\u064B-\u0652]/g, '')
    .replace(/[إأآا]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function tokenize(text: string): string[] {
  return normalizeArabic(text).split(/\s+/).filter((w) => w.length > 1);
}

function jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  return intersection / (setA.size + setB.size - intersection);
}

function matchServices(
  query: string,
  services: Service[],
  agencies: Agency[],
  policies: Policy[],
  clauses: PolicyClause[],
): ServiceStep[] {
  const queryTokens = new Set(tokenize(query));
  const queryNorm = normalizeArabic(query);
  const scored: Array<{ service: Service; score: number; matchedKeywords: string[] }> = [];

  for (const svc of services) {
    const keywords = (svc.keywords || []).map(normalizeArabic);
    const svcName = normalizeArabic(svc.name);
    const svcDesc = normalizeArabic(svc.description || '');

    let score = 0;
    const matchedKeywords: string[] = [];

    for (const kw of keywords) {
      if (queryNorm.includes(kw)) {
        score += 3;
        matchedKeywords.push(kw);
      }
    }

    const svcTokens = new Set([...tokenize(svcName), ...tokenize(svcDesc), ...keywords.map((k) => tokenize(k)).flat()]);
    const sim = jaccardSimilarity(queryTokens, svcTokens);
    score += sim * 5;

    if (svcName && queryNorm.includes(svcName)) score += 5;

    if (score > 1.5) {
      scored.push({ service: svc, score, matchedKeywords });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, 5);

  return top.map(({ service, matchedKeywords }) => {
    const agency = agencies.find((a) => a.id === service.agency_id);
    const policy = policies.find((p) => p.id === service.policy_id);
    const policyClauses = clauses.filter((c) => c.policy_id === service.policy_id);

    const reason = matchedKeywords.length > 0
      ? `اقترحت لأن طلبك يتعلق بـ: ${matchedKeywords.slice(0, 3).join('، ')}`
      : 'اقترحت لأنها مرتبطة بموضوع طلبك';

    const version = policy?.effective_date
      ? `النسخة السارية (${new Date(policy.effective_date).toLocaleDateString('ar-SA')})`
      : 'النسخة الحالية';

    return {
      serviceName: service.name,
      agencyName: agency?.name || 'جهة غير محددة',
      reason,
      requirements: service.requirements || [],
      link: service.link,
      policyTitle: policy?.title || '',
      policyVersion: version,
    };
  });
}

function detectMissingInfo(query: string): string | undefined {
  const norm = normalizeArabic(query);

  if (norm.includes('مطعم') || norm.includes('مطاعم')) {
    if (!norm.includes('جده') && !norm.includes('مكه') && !norm.includes('الرياض') && !norm.includes('الدمام') && !norm.includes('مدينه')) {
      return 'في أي مدينة تريد فتح المطعم؟';
    }
  }
  if (norm.includes('استثمار') || norm.includes('شريك')) {
    if (!norm.includes('نشاط') && !norm.includes('مطعم') && !norm.includes('شركه') && !norm.includes('تجاره')) {
      return 'ما نوع النشاط أو المجال الذي تريد الاستثمار فيه؟';
    }
  }
  return undefined;
}

export function processCitizenQuery(
  query: string,
  services: Service[],
  agencies: Agency[],
  policies: Policy[],
  clauses: PolicyClause[],
  conversationHistory: Array<{ role: string; content: string }>,
): AssistantResult {
  const missingInfo = detectMissingInfo(query);
  const steps = matchServices(query, services, agencies, policies, clauses);

  if (steps.length === 0) {
    return {
      reply: 'لم أتمكن من العثور على خدمة مطابقة لطلبك. هل يمكنك إعادة صياغة طلبك بمزيد من التفاصيل؟ مثلاً: "أريد فتح مطعم في جدة" أو "أريد تسجيل منتج غذائي".',
      steps: [],
    };
  }

  const stepsText = steps.length > 0
    ? `وجدت ${steps.length} ${steps.length === 1 ? 'خدمة' : 'خدمات'} مرتبطة بطلبك:`
    : '';

  const missingText = missingInfo ? `\n\nملاحظة: ${missingInfo}` : '';

  return {
    reply: `${stepsText}${missingText}`,
    steps,
    missingInfo,
  };
}
