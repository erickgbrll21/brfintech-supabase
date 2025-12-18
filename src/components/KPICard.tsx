import { memo, useMemo } from 'react';
import { LucideIcon } from 'lucide-react';

interface KPICardProps {
  title: string;
  value: string | number;
  change?: number;
  icon: LucideIcon;
  format?: 'currency' | 'number' | 'percentage';
}

const KPICard = memo(({ title, value, change, icon: Icon, format = 'number' }: KPICardProps) => {
  const formattedValue = useMemo(() => {
    if (typeof value === 'string') return value;
    
    // Garantir que o valor seja um número válido
    if (isNaN(value) || value === null || value === undefined) return '0';
    
    switch (format) {
      case 'currency':
        return new Intl.NumberFormat('pt-BR', {
          style: 'currency',
          currency: 'BRL',
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(value);
      case 'percentage':
        return `${value.toFixed(2)}%`;
      default:
        return new Intl.NumberFormat('pt-BR', {
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        }).format(value);
    }
  }, [value, format]);

  return (
    <div className="bg-white border-2 border-black rounded-lg p-3 md:p-4 lg:p-5 xl:p-6 hover:shadow-lg transition-shadow w-full">
      <div className="flex items-start justify-between mb-2 md:mb-3 lg:mb-4 gap-2">
        <h3 className="text-xs md:text-sm font-medium text-gray-600 uppercase tracking-wide leading-tight flex-1 min-w-0 break-words">
          {title}
        </h3>
        <div className="bg-black p-1.5 md:p-2 rounded-lg flex-shrink-0 flex items-center justify-center overflow-hidden min-w-[28px] min-h-[28px] md:min-w-[32px] md:min-h-[32px] lg:min-w-[36px] lg:min-h-[36px]">
          <Icon className="w-3.5 h-3.5 md:w-4 md:h-4 lg:w-5 lg:h-5 text-white flex-shrink-0" />
        </div>
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xl md:text-2xl lg:text-3xl font-bold text-black break-words flex-1 min-w-0 overflow-visible whitespace-normal">{formattedValue}</p>
        {change !== undefined && (
          <span
            className={`text-xs md:text-sm font-semibold flex-shrink-0 ${
              change >= 0 ? 'text-green-600' : 'text-red-600'
            }`}
          >
            {change >= 0 ? '+' : ''}
            {change.toFixed(2)}%
          </span>
        )}
      </div>
    </div>
  );
});

KPICard.displayName = 'KPICard';

export default KPICard;

