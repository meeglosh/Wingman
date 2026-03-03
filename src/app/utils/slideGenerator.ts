import type { SlideLayout, SlideContent, SlideSuggestion, SlideGenerationResult, Slide } from '../types/presentation';
import { projectId, publicAnonKey } from '/utils/supabase/info';

// ─── Topic knowledge graph for smart suggestions ───────────────────────────────
const topicGraph: Record<string, Array<{ topic: string; description: string; emoji: string }>> = {
  'introduction|overview|intro|welcome|today': [
    { topic: 'The Problem We\'re Solving', description: 'Define the core challenge and why it matters', emoji: '🎯' },
    { topic: 'Historical Background', description: 'Context and how we got here', emoji: '📚' },
    { topic: 'Key Concepts & Definitions', description: 'Establish foundational terminology', emoji: '💡' },
  ],
  'history|background|origin|evolution|past': [
    { topic: 'Current State of Affairs', description: 'Where things stand today', emoji: '📊' },
    { topic: 'Key Milestones', description: 'Pivotal moments that shaped the field', emoji: '🏁' },
    { topic: 'Lessons Learned', description: 'What we can take away from the past', emoji: '🧠' },
  ],
  'problem|challenge|issue|pain|struggle': [
    { topic: 'Our Proposed Solution', description: 'How we address the core problem', emoji: '🛠️' },
    { topic: 'Scale of Impact', description: 'How many people are affected and how', emoji: '🌍' },
    { topic: 'Root Cause Analysis', description: 'Why this problem exists', emoji: '🔍' },
  ],
  'solution|approach|strategy|method|proposal': [
    { topic: 'Implementation Roadmap', description: 'Step-by-step execution plan', emoji: '🗺️' },
    { topic: 'Expected Results & KPIs', description: 'How we measure success', emoji: '📈' },
    { topic: 'Risk Assessment', description: 'Potential challenges and mitigation', emoji: '⚠️' },
  ],
  'data|research|study|statistics|evidence|metric': [
    { topic: 'Key Findings', description: 'The most important takeaways from the data', emoji: '🔑' },
    { topic: 'Trends & Patterns', description: 'What the numbers reveal over time', emoji: '📉' },
    { topic: 'Implications & Next Steps', description: 'What the data means for us', emoji: '🎯' },
  ],
  'ai|machine learning|ml|neural|model|llm': [
    { topic: 'Real-World Applications', description: 'Where this technology is already working', emoji: '🤖' },
    { topic: 'Ethical Considerations', description: 'Bias, safety, and responsible deployment', emoji: '⚖️' },
    { topic: 'The Road Ahead', description: 'What the next 5 years will look like', emoji: '🚀' },
  ],
  'market|industry|competition|landscape|sector': [
    { topic: 'Competitive Landscape', description: 'Key players and their positioning', emoji: '♟️' },
    { topic: 'Market Size & Opportunity', description: 'Total addressable market and growth potential', emoji: '💰' },
    { topic: 'Go-to-Market Strategy', description: 'How to capture market share', emoji: '🎪' },
  ],
  'revenue|profit|growth|financial|sales|money': [
    { topic: 'Cost Structure & Burn Rate', description: 'Where the money goes', emoji: '💸' },
    { topic: 'Funding & Investment', description: 'Capital needed and sources', emoji: '🏦' },
    { topic: 'Path to Profitability', description: 'When and how we become sustainable', emoji: '📈' },
  ],
  'team|people|culture|talent|hire|organization': [
    { topic: 'Organizational Structure', description: 'How the team is structured for success', emoji: '🏗️' },
    { topic: 'Key Hires & Gaps', description: 'Who we need to bring on next', emoji: '🔮' },
    { topic: 'Culture & Values', description: 'The principles that guide our work', emoji: '💫' },
  ],
  'product|feature|design|ux|user|customer': [
    { topic: 'User Research Insights', description: 'What we learned from real users', emoji: '👥' },
    { topic: 'Product Roadmap', description: 'What\'s coming in the next quarters', emoji: '🗓️' },
    { topic: 'Feature Prioritization', description: 'How we decide what to build next', emoji: '🎯' },
  ],
  'climate|environment|sustainability|carbon|green': [
    { topic: 'Impact by the Numbers', description: 'Quantifying the environmental toll', emoji: '🌡️' },
    { topic: 'Renewable Solutions', description: 'Technologies driving the transition', emoji: '☀️' },
    { topic: 'Call to Action', description: 'What needs to happen now', emoji: '📢' },
  ],
  'technology|tech|software|platform|system|digital': [
    { topic: 'Technical Architecture', description: 'How the system is built under the hood', emoji: '⚙️' },
    { topic: 'Security & Compliance', description: 'How we protect data and meet standards', emoji: '🔐' },
    { topic: 'Scalability Plan', description: 'How the system handles 10x growth', emoji: '📡' },
  ],
  'health|medical|clinical|patient|treatment|care': [
    { topic: 'Clinical Evidence', description: 'Trials, studies, and outcomes data', emoji: '🧬' },
    { topic: 'Patient Journey', description: 'The end-to-end care experience', emoji: '🏥' },
    { topic: 'Healthcare Landscape', description: 'Key stakeholders and their incentives', emoji: '🩺' },
  ],
};

const defaultSuggestions: Array<{ topic: string; description: string; emoji: string }> = [
  { topic: 'Supporting Evidence', description: 'Data, case studies, and proof points', emoji: '📋' },
  { topic: 'Key Benefits & Value', description: 'Why this matters to your audience', emoji: '✨' },
  { topic: 'Implementation Steps', description: 'A practical path to execution', emoji: '🪜' },
  { topic: 'Case Study', description: 'A real-world example that illustrates the point', emoji: '🏆' },
  { topic: 'Frequently Asked Questions', description: 'Address the most common objections', emoji: '❓' },
  { topic: 'Conclusion & Takeaways', description: 'What the audience should remember', emoji: '🎯' },
];

export function toTitleCase(str: string): string {
  const minorWords = new Set(['a', 'an', 'the', 'and', 'but', 'or', 'for', 'nor', 'on', 'at', 'to', 'by', 'in', 'of', 'up', 'as', 'is', 'it']);
  return str.replace(/\w\S*/g, (word, idx) => {
    const lower = word.toLowerCase();
    if (idx !== 0 && minorWords.has(lower)) return lower;
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });
}

export function cleanBullet(sentence: string): string {
  return sentence
    .trim()
    .replace(/^(and |but |also |furthermore |additionally |moreover |however )/i, '')
    .replace(/[.!?,;]+$/, '')
    .trim();
}

/**
 * Converts a raw speech transcript chunk into a clean presentation bullet point.
 * Returns null if the text is a fragment, filler, or meta-speech about the
 * presentation itself (which should be silently dropped).
 */
export function formatBulletPoint(rawText: string): string | null {
  // Strip leading punctuation artifacts — Whisper sometimes produces ", continuation text"
  let s = rawText.replace(/^[\s,;.]+/, '').trim();

  // Remove filler words
  s = removeFiller(s);
  if (!s) return null;

  // Remove first-person openers that are speech artifacts, not content
  s = s
    .replace(/^i (think|believe|feel|guess|mean|suppose)(,? that)?\s+/i, '')
    .replace(/^i (definitely|really|honestly|actually|just|kind of|sort of)\s+/i, '')
    .replace(/^(so|well|alright|okay|right|yeah|yep),?\s+/i, '')
    .replace(/^(what i (mean|want to say) is,?\s*)/i, '')
    .trim();

  // Remove trailing qualifiers that weaken the bullet
  s = s
    .replace(/,\s*(you know|right|i think|i guess|i mean|or something|kind of|sort of)(\.?)\s*$/i, '')
    .replace(/[.!?,;:]+$/, '')
    .trim();

  // Too short / too few words to be a meaningful bullet
  const wordCount = s.split(/\s+/).filter(Boolean).length;
  if (wordCount < 3 || s.length < 10) return null;

  // Drop naked fragment starters without a real subject (e.g. "it really has")
  if (/^(it|is|was|were|and then|but then|that is|which is)\b/i.test(s) && wordCount < 5) return null;

  // Drop meta-speech about the presentation/slide itself
  if (/\b(this slide|next slide|new slide|bullet point|the formatting|slide deck)\b/i.test(s)) return null;

  // Capitalize first letter
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function splitIntoSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|(?<=\n)/)
    .map(s => s.trim())
    .filter(s => s.length > 8);
}

export function removeFiller(text: string): string {
  return text
    .replace(/\b(um|uh|like|you know|sort of|kind of|basically|actually|literally|honestly|right|okay|so)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractUnsplashQuery(topic: string): string {
  const stopWords = new Set([
    'the','a','an','and','or','but','in','on','at','to','for','of','with','by',
    'from','is','are','was','were','be','been','being','have','has','had','do',
    'does','did','will','would','could','should','may','might','must','shall',
    'can','need','our','your','my','their','its','this','that','these','those',
    'we','you','i','they','it','he','she','who','which','what','about','into',
    'through','during','before','after','above','below','between','out','off',
    'over','under','again','there','when','where','why','how','all','each',
    'every','both','few','more','most','other','some','such','no','not','only',
    'same','so','than','too','very','just','then','also','here','new','now',
  ]);
  const words = topic
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !stopWords.has(w));
  return words.slice(0, 3).join(' ') || topic.slice(0, 30);
}

function extractTitle(sentence: string, hint?: string): string {
  if (hint) {
    return toTitleCase(hint.replace(/[.!?]+$/, '').trim());
  }
  let title = removeFiller(sentence);
  title = title
    .replace(/^(today|so|now|let me|let's|i want to|i'd like to|we're going to|we will|first|next|alright)\s*(talk about|discuss|cover|look at|explore|examine|show|present|introduce|explain|tell you about)?\s*/i, '')
    .replace(/^(in this slide|on this slide|here we see|here we have|as you can see|what i mean is)\s*/i, '')
    .replace(/[.!?]+$/, '')
    .trim();
  title = toTitleCase(title);
  if (title.length > 72) {
    const cut = title.lastIndexOf(' ', 68);
    title = title.substring(0, cut > 0 ? cut : 68) + '…';
  }
  return title || 'New Slide';
}

function hasStatContent(text: string): boolean {
  const patterns = [
    /\b\d+(\.\d+)?%/g,
    /\$\d+(\.\d+)?\s?(billion|million|thousand|k|m|b)/gi,
    /\b\d+x\b/gi,
    /\b(grew|increased|decreased|reduced|improved)\s+by\s+\d+/gi,
  ];
  return patterns.reduce((count, p) => count + (text.match(p)?.length ?? 0), 0) >= 2;
}

function hasQuoteContent(text: string): boolean {
  return /"[^"]{20,}"/.test(text) || /\b(said|stated|quoted|according to|as .+ put it)\b/i.test(text);
}

function extractStats(text: string): Array<{ value: string; label: string }> {
  const stats: Array<{ value: string; label: string }> = [];
  const sentences = splitIntoSentences(text);
  const statPattern = /(\$?[\d,.]+\s?(?:billion|million|thousand|k|m|b|%|x)?)\s*(.{5,40})/i;
  for (const s of sentences) {
    const m = s.match(statPattern);
    if (m && stats.length < 4) {
      stats.push({ value: m[1].trim(), label: m[2].trim().replace(/[,;.]+$/, '') });
    }
  }
  if (stats.length === 0) {
    stats.push(
      { value: '3×', label: 'Faster execution' },
      { value: '87%', label: 'Improvement rate' },
      { value: '$2.4M', label: 'Annual impact' },
      { value: '94%', label: 'User satisfaction' },
    );
  }
  return stats.slice(0, 4);
}

function extractQuote(text: string): { quote: string; attribution?: string } {
  const match = text.match(/"([^"]{20,})"\s*(?:[-–—]\s*(.+))?/);
  if (match) {
    return { quote: match[1], attribution: match[2]?.replace(/[.!?]+$/, '') };
  }
  const accMatch = text.match(/according to ([^,]+),?\s*"?(.{20,})"?/i);
  if (accMatch) {
    return { quote: accMatch[2].replace(/[.!?]+$/, ''), attribution: accMatch[1] };
  }
  const sentences = splitIntoSentences(text);
  return {
    quote: sentences[0] ?? text.slice(0, 150),
    attribution: sentences[1] ? undefined : undefined,
  };
}

function generateSuggestions(title: string, bullets: string[], previousSlides: Slide[]): SlideSuggestion[] {
  const fullText = [title, ...bullets, ...previousSlides.map(s => s.content.title)].join(' ').toLowerCase();
  const matched: Array<{ topic: string; description: string; emoji: string }> = [];

  for (const [pattern, suggestions] of Object.entries(topicGraph)) {
    const keywords = pattern.split('|');
    if (keywords.some(k => fullText.includes(k))) {
      matched.push(...suggestions);
    }
  }

  // Deduplicate
  const seen = new Set<string>();
  const unique = [...matched, ...defaultSuggestions].filter(s => {
    if (seen.has(s.topic)) return false;
    seen.add(s.topic);
    return true;
  });

  // Shuffle slightly (deterministic based on title length)
  const seed = title.length;
  const shuffled = [...unique];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = (i * seed * 31 + 7) % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled.slice(0, 3);
}

export function generateSlideFromSpeech(
  transcript: string,
  previousSlides: Slide[],
  hint?: string,
): SlideGenerationResult {
  const raw = hint ? `${hint}. ${transcript}` : transcript;
  const clean = removeFiller(raw.trim().replace(/\s+/g, ' '));
  const sentences = splitIntoSentences(clean);

  if (sentences.length === 0) {
    const fallbackTitle = hint ? toTitleCase(hint) : 'New Slide';
    return {
      layout: 'title',
      content: { title: fallbackTitle, subtitle: 'Add your content here' },
      suggestions: generateSuggestions(fallbackTitle, [], previousSlides),
    };
  }

  const title = extractTitle(sentences[0], hint && sentences.length <= 1 ? hint : undefined);
  const remaining = sentences.slice(1);

  let layout: SlideLayout;
  let content: SlideContent;

  if (sentences.length === 1) {
    layout = 'title';
    content = { title, subtitle: hint ?? '' };
  } else if (hasQuoteContent(clean) && sentences.length <= 3) {
    layout = 'quote';
    const q = extractQuote(remaining.join(' '));
    content = { title, quote: q.quote, attribution: q.attribution };
  } else if (hasStatContent(clean)) {
    layout = 'stats';
    const nonStatBullets = remaining.filter(s => !hasStatContent(s)).slice(0, 2).map(cleanBullet);
    content = { title, stats: extractStats(clean), bullets: nonStatBullets.length ? nonStatBullets : undefined };
  } else if (remaining.length >= 4) {
    layout = 'bullets';
    content = { title, bullets: remaining.slice(0, 5).map(cleanBullet) };
  } else {
    layout = 'content';
    content = { title, bullets: remaining.slice(0, 4).map(cleanBullet) };
  }

  const suggestions = generateSuggestions(title, content.bullets ?? [], previousSlides);
  return { layout, content, suggestions };
}

export function generateTitleSlide(presentationTitle: string): { layout: SlideLayout; content: SlideContent } {
  return {
    layout: 'title',
    content: {
      title: presentationTitle,
      subtitle: 'Press the microphone to begin speaking your presentation',
    },
  };
}

export async function generateSlideWithAI(
  transcript: string,
  previousSlides: Slide[],
  presentationTitle: string,
): Promise<SlideGenerationResult> {
  const previousSlideTitles = previousSlides.map(s => s.content.title).slice(-6);

  try {
    const res = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-8474fcb9/generate-slide`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify({ transcript, presentationTitle, previousSlideTitles }),
      },
    );

    if (!res.ok) {
      const errText = await res.text();
      console.warn('AI slide generation failed, falling back to local:', res.status, errText);
      return generateSlideFromSpeech(transcript, previousSlides);
    }

    const data = await res.json();
    if (data.error) {
      console.warn('AI slide generation error, falling back to local:', data.error);
      return generateSlideFromSpeech(transcript, previousSlides);
    }

    const layout: SlideLayout = data.layout;
    const content: SlideContent = data.content;

    // Strip the redundant "layout" key OpenAI echoes into the content object
    delete (content as any).layout;

    const suggestions = generateSuggestions(content.title, content.bullets ?? [], previousSlides);
    return { layout, content, suggestions };
  } catch (e) {
    console.warn('AI slide generation threw, falling back to local:', e);
    return generateSlideFromSpeech(transcript, previousSlides);
  }
}