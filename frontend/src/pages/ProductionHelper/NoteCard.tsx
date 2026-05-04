import { PHPlanItem } from '@/api/productionHelper';

interface Props {
  item: PHPlanItem;
  onClick: () => void;
}

export default function NoteCard({ item, onClick }: Props) {
  return (
    <article
      className="cursor-pointer rounded-xl border border-yellow-300 bg-yellow-50 p-2.5 mb-2 shadow-sm hover:border-yellow-500 transition-colors"
      onClick={onClick}
    >
      <div className="font-extrabold text-sm text-yellow-900">
        {item.title || '（無標題）'}
      </div>
      {item.content ? (
        <div className="text-xs text-yellow-800 mt-1 whitespace-pre-wrap break-words">
          {item.content}
        </div>
      ) : null}
      <span className="inline-block mt-1.5 px-1.5 py-0 text-[10px] font-bold tracking-wider rounded-full text-yellow-700 bg-yellow-100 border border-yellow-200">
        便條
      </span>
    </article>
  );
}
