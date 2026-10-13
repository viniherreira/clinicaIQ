'use client';

import { createContext, useContext } from 'react';
import { AGENDA_DEFAULTS, makeGrid, type AgendaGrid } from '@/lib/agenda-rules';

/** A geometria da grade da agenda (início/fim do dia e intervalo), das Regras da agenda. */
export const GridContext = createContext<AgendaGrid>(makeGrid(AGENDA_DEFAULTS));
export const useGrid = () => useContext(GridContext);
