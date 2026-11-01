// foliate-js ships plain JavaScript. These declarations cover the parts Octavo uses.

declare module 'foliate-js/view.js' {
  export interface FoliateTocItem {
    label: string
    href: string
    subitems?: FoliateTocItem[]
  }

  export interface FoliateContributor {
    name?: string | Record<string, string>
  }

  export type LanguageMap = string | Record<string, string>

  export interface FoliateBook {
    metadata?: {
      title?: LanguageMap
      author?: Array<string | FoliateContributor> | string | FoliateContributor
      publisher?: LanguageMap | FoliateContributor | Array<string | FoliateContributor>
      language?: string | string[]
      published?: string
      description?: string
    }
    toc?: FoliateTocItem[]
    dir?: string
    sections: Array<{ linear?: string }>
    getCover?(): Promise<Blob | null>
  }

  export interface RelocateDetail {
    fraction: number
    section?: { current: number; total: number }
    location?: { current: number; next: number; total: number }
    tocItem?: { label: string; href: string }
    pageItem?: { label: string }
    cfi: string
    range?: Range
  }

  export interface FoliatePaginator extends HTMLElement {
    setStyles(styles: string | [string, string]): void
    getContents(): Array<{ index: number; doc: Document }>
    readonly atEnd: boolean
  }

  export class View extends HTMLElement {
    book: FoliateBook
    renderer: FoliatePaginator
    lastLocation: RelocateDetail | null
    open(book: File | Blob | string): Promise<void>
    close(): void
    init(opts: { lastLocation?: string | null; showTextStart?: boolean }): Promise<void>
    goTo(target: string | number): Promise<unknown>
    goToFraction(fraction: number): Promise<void>
    prev(distance?: number): Promise<void>
    next(distance?: number): Promise<void>
    goLeft(): Promise<void>
    goRight(): Promise<void>
    addAnnotation(annotation: { value: string; color?: string }, remove?: boolean): Promise<{ index: number; label: string } | undefined>
    deleteAnnotation(annotation: { value: string }): Promise<unknown>
    getCFI(index: number, range?: Range): string
    getSectionFractions(): number[]
    getProgressOf(index: number, range: Range): { tocItem?: { label: string }; pageItem?: { label: string } }
    deselect(): void
  }

  export function makeBook(file: File | Blob | string): Promise<FoliateBook>
}

declare module 'foliate-js/overlayer.js' {
  export type DrawFunction = (rects: DOMRect[], options?: Record<string, unknown>) => SVGElement
  export class Overlayer {
    static highlight: DrawFunction
    static underline: DrawFunction
  }
}

declare module 'foliate-js/epubcfi.js' {
  export function compare(a: string, b: string): number
  export function collapse(cfi: string, toEnd?: boolean): string
  export const isCFI: RegExp
}
