import { writable } from 'svelte/store';
import type { Heading } from '../types';

export const stickyHeadings = writable<Heading[]>([]);

export const editMode = writable<boolean>(false);
