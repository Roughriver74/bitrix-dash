'use client';

interface ViewIndicatorProps {
  views: Array<{ id: string; name: string; component: string }>;
  currentView: number;
  timeUntilNext: number;
  isPaused: boolean;
  onViewSelect: (index: number) => void;
}

export function ViewIndicator({ 
  views, 
  currentView, 
  timeUntilNext, 
  isPaused,
  onViewSelect 
}: ViewIndicatorProps) {
  return (
    <div className="bg-gray-800 p-4 rounded-xl mb-6">
      <div className="flex items-center justify-between">
        {/* Индикаторы представлений */}
        <div className="flex gap-2">
          {views.map((view, index) => (
            <button
              key={view.id}
              onClick={() => onViewSelect(index)}
              className={`
                px-4 py-2 rounded-lg font-medium transition-all text-lg
                ${index === currentView 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }
              `}
            >
              {view.name}
            </button>
          ))}
        </div>

        {/* Таймер до следующего переключения */}
        <div className="flex items-center gap-4">
          <div className="text-gray-300 text-lg">
            {isPaused ? (
              <span className="text-yellow-400">Пауза</span>
            ) : (
              <>
                Следующее через: 
                <span className="font-bold text-white ml-2">
                  {Math.floor(timeUntilNext / 60)}:{String(timeUntilNext % 60).padStart(2, '0')}
                </span>
              </>
            )}
          </div>
          
          {/* Прогресс бар */}
          {!isPaused && (
            <div className="w-32 h-2 bg-gray-700 rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-500 transition-all duration-1000"
                style={{ 
                  width: `${(timeUntilNext / 30) * 100}%` 
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}