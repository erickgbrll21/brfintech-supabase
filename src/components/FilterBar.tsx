import { useState, useEffect, memo, useCallback } from 'react';
import { FilterOptions } from '../types';
import { Calendar, X } from 'lucide-react';

interface FilterBarProps {
  onFilterChange: (filters: FilterOptions) => void;
}

const FilterBar = memo(({ onFilterChange }: FilterBarProps) => {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    // Usar timeout para evitar chamadas muito frequentes
    const timeoutId = setTimeout(() => {
      const filters: FilterOptions = {
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      };
      onFilterChange(filters);
    }, 300); // Debounce de 300ms

    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate]);

  const clearFilters = useCallback(() => {
    setStartDate('');
    setEndDate('');
  }, []);

  const hasActiveFilters = startDate || endDate;

  return (
    <div className="bg-white border-2 border-black rounded-lg p-3 md:p-4 mb-4 md:mb-6">
      <div className="flex items-center justify-between mb-3 md:mb-4">
        <h3 className="text-base md:text-lg font-semibold text-black flex items-center">
          <Calendar className="w-4 h-4 md:w-5 md:h-5 mr-2" />
          Filtros
        </h3>
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="text-sm text-gray-600 hover:text-black flex items-center"
          >
            <X className="w-4 h-4 mr-1" />
            Limpar
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 md:gap-3 lg:gap-4">
        <div>
          <label className="block text-sm font-medium text-black mb-2">
            Data Inicial
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-black transition-colors"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-black mb-2">
            Data Final
          </label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-black transition-colors"
          />
        </div>
      </div>
    </div>
  );
});

FilterBar.displayName = 'FilterBar';

export default FilterBar;

