import { ExternalLink, ClipboardPaste, ShieldCheck, Gift, Smartphone } from 'lucide-react';
import { Sheet } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const AI_STUDIO_URL = 'https://aistudio.google.com/apikey';
const GOOGLE_SIGNUP_URL = 'https://accounts.google.com/signup';

/** Tutoriel ultra simple pour obtenir sa clé Gemini sans aide. */
export function ApiKeyHelp({ open, onClose, onPaste }: { open: boolean; onClose: () => void; onPaste: () => void }) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Obtenir ta clé IA (gratuit)"
      footer={
        <Button className="w-full" size="lg" onClick={onPaste}>
          <ClipboardPaste /> J'ai copié ma clé : la coller
        </Button>
      }
    >
      <div className="space-y-4 pb-2 text-sm text-slate-300">
        <p className="rounded-xl bg-emerald-500/10 p-3 text-emerald-200">
          La clé permet à Kal-Track d'analyser tes repas avec l'IA de Google. Ça prend <b>2 minutes</b>, c'est <b>gratuit</b> et <b>sans carte bancaire</b>.
        </p>

        <Step n={1} title="Ouvre la page de Google">
          <a href={AI_STUDIO_URL} target="_blank" rel="noreferrer" className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-indigo-500 px-4 py-3 font-semibold text-white active:scale-[0.98]">
            Ouvrir Google AI Studio <ExternalLink className="h-4 w-4" />
          </a>
        </Step>

        <Step n={2} title="Connecte-toi avec ton compte Google">
          C'est le même compte que ta boîte Gmail.
          <br />
          Pas de compte ?{' '}
          <a href={GOOGLE_SIGNUP_URL} target="_blank" rel="noreferrer" className="font-medium text-indigo-300 underline">
            En créer un ici
          </a>
          .
        </Step>

        <Step n={3} title="Accepte les conditions">
          La première fois, Google affiche un message : coche la case puis appuie sur <b>« Continuer »</b>. Si une présentation s'ouvre, ferme-la.
        </Step>

        <Step n={4} title="Crée la clé">
          Appuie sur le bouton bleu <Kbd>Create API key</Kbd> (ou <Kbd>Créer une clé API</Kbd>). Si on te demande un projet, garde celui proposé et valide.
        </Step>

        <Step n={5} title="Copie la clé">
          Une suite de lettres et chiffres apparaît, elle commence par <Kbd>AIza…</Kbd>. Appuie sur l'icône <b>Copier</b> 📋 juste à côté.
        </Step>

        <Step n={6} title="Reviens ici et colle-la">
          Reviens dans Kal-Track, appuie sur le bouton vert <b>« J'ai copié ma clé »</b> en bas, puis sur <b>« Tester la connexion »</b>. ✅ C'est prêt !
        </Step>

        <div className="space-y-2 rounded-xl border border-slate-700 p-3 text-xs text-slate-400">
          <p className="flex gap-2">
            <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" />
            Ta clé est personnelle : elle reste sur ton téléphone. Ne la partage avec personne.
          </p>
          <p className="flex gap-2">
            <Gift className="h-4 w-4 shrink-0 text-amber-400" />
            Gratuit pour un usage normal. Si un message « quota dépassé » apparaît, attends simplement quelques minutes.
          </p>
          <p className="flex gap-2">
            <Smartphone className="h-4 w-4 shrink-0 text-sky-400" />
            Page Google difficile à lire sur téléphone ? Sur iPhone, appuie sur « aA » dans la barre d'adresse puis « Version pour ordinateur ». Sur Android, menu ⋮ puis « Version pour ordinateur ».
          </p>
        </div>
      </div>
    </Sheet>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-sm font-bold text-slate-950">{n}</span>
      <div className="flex-1">
        <p className="font-semibold text-slate-100">{title}</p>
        <div className="mt-0.5 text-[13px] leading-relaxed text-slate-400">{children}</div>
      </div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <span className="rounded-md bg-slate-800 px-1.5 py-0.5 font-mono text-[12px] text-slate-200">{children}</span>;
}
