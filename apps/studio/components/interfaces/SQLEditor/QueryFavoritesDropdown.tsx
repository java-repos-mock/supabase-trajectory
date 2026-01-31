import { useState, useMemo } from 'react'
import { Star, StarOff, Search, Clock, TrendingUp, Trash2, MoreVertical } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

import { useQueryFavorites, QueryFavorite } from 'hooks/misc/useQueryFavorites'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  ScrollArea,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  cn,
} from 'ui'

export interface QueryFavoritesDropdownProps {
  currentSql?: string
  onSelectFavorite: (sql: string) => void
  onToggleFavorite?: (sql: string) => void
}

/**
 * Dropdown component for managing SQL query favorites.
 * 
 * Allows users to quickly access saved queries, star the current
 * query, and manage their favorites collection.
 */
export function QueryFavoritesDropdown({
  currentSql,
  onSelectFavorite,
  onToggleFavorite,
}: QueryFavoritesDropdownProps) {
  const {
    favorites,
    addFavorite,
    removeFavorite,
    recordUsage,
    isFavorited,
    findBySql,
    sortedByUsage,
    sortedByRecent,
    searchFavorites,
  } = useQueryFavorites()

  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<'recent' | 'popular'>('recent')

  const isCurrentFavorited = currentSql ? isFavorited(currentSql) : false

  const displayedFavorites = useMemo(() => {
    if (searchQuery) {
      return searchFavorites(searchQuery)
    }
    return activeTab === 'recent' ? sortedByRecent() : sortedByUsage()
  }, [searchQuery, activeTab, searchFavorites, sortedByRecent, sortedByUsage])

  const handleToggleFavorite = () => {
    if (!currentSql) return

    if (isCurrentFavorited) {
      const existing = findBySql(currentSql)
      if (existing) {
        removeFavorite(existing.id)
      }
    } else {
      addFavorite(currentSql)
    }
    onToggleFavorite?.(currentSql)
  }

  const handleSelectFavorite = (favorite: QueryFavorite) => {
    recordUsage(favorite.id)
    onSelectFavorite(favorite.sql)
    setIsOpen(false)
  }

  const handleDeleteFavorite = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    removeFavorite(id)
  }

  return (
    <div className="flex items-center gap-1">
      {/* Toggle favorite button */}
      <Button
        type="text"
        size="tiny"
        icon={isCurrentFavorited ? <Star className="fill-yellow-400 text-yellow-400" size={14} /> : <StarOff size={14} />}
        onClick={handleToggleFavorite}
        disabled={!currentSql?.trim()}
        className={cn(
          'transition-colors',
          isCurrentFavorited && 'text-yellow-400 hover:text-yellow-500'
        )}
      >
        {isCurrentFavorited ? 'Starred' : 'Star'}
      </Button>

      {/* Favorites dropdown */}
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            type="text"
            size="tiny"
            icon={<Star size={14} />}
            className="relative"
          >
            Favorites
            {favorites.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-brand text-brand-foreground text-[10px] rounded-full px-1.5">
                {favorites.length}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="start">
          <div className="p-3 border-b border-default">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-foreground-light" size={14} />
              <Input
                placeholder="Search favorites..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-8"
              />
            </div>
          </div>

          {!searchQuery && (
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
              <TabsList className="w-full grid grid-cols-2 p-1">
                <TabsTrigger value="recent" className="text-xs">
                  <Clock size={12} className="mr-1" />
                  Recent
                </TabsTrigger>
                <TabsTrigger value="popular" className="text-xs">
                  <TrendingUp size={12} className="mr-1" />
                  Popular
                </TabsTrigger>
              </TabsList>
            </Tabs>
          )}

          <ScrollArea className="max-h-64">
            {displayedFavorites.length === 0 ? (
              <div className="p-4 text-center text-foreground-light text-sm">
                {searchQuery ? 'No matching favorites' : 'No favorites yet'}
              </div>
            ) : (
              <div className="py-1">
                {displayedFavorites.map((favorite) => (
                  <FavoriteItem
                    key={favorite.id}
                    favorite={favorite}
                    onSelect={() => handleSelectFavorite(favorite)}
                    onDelete={(e) => handleDeleteFavorite(e, favorite.id)}
                  />
                ))}
              </div>
            )}
          </ScrollArea>
        </PopoverContent>
      </Popover>
    </div>
  )
}

interface FavoriteItemProps {
  favorite: QueryFavorite
  onSelect: () => void
  onDelete: (e: React.MouseEvent) => void
}

function FavoriteItem({ favorite, onSelect, onDelete }: FavoriteItemProps) {
  return (
    <div
      className="px-3 py-2 hover:bg-surface-100 cursor-pointer group flex items-start justify-between"
      onClick={onSelect}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Star className="fill-yellow-400 text-yellow-400 shrink-0" size={12} />
          <span className="font-medium text-sm truncate">{favorite.name}</span>
        </div>
        <p className="text-xs text-foreground-light truncate mt-0.5 font-mono">
          {favorite.sql.slice(0, 50)}{favorite.sql.length > 50 ? '...' : ''}
        </p>
        <div className="flex items-center gap-2 mt-1 text-[10px] text-foreground-lighter">
          <span>Used {favorite.useCount} times</span>
          <span>•</span>
          <span>{formatDistanceToNow(favorite.lastUsedAt, { addSuffix: true })}</span>
        </div>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="text"
            size="tiny"
            icon={<MoreVertical size={14} />}
            onClick={(e) => e.stopPropagation()}
            className="opacity-0 group-hover:opacity-100 transition-opacity"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onDelete} className="text-destructive">
            <Trash2 size={14} className="mr-2" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
