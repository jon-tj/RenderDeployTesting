import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, Input, OnDestroy, QueryList, ViewChildren, inject, signal } from '@angular/core';
import { I18nService } from '../services/i18n.service';

interface AnnouncementInfo {
  id: number;
  title: string;
  message: string;
  createdAt: string;
  createdBy: string;
}

@Component({
  selector: 'app-announcements-panel',
  standalone: true,
  template: `
    @if (announcements.length > 0) {
      <article class="announcement-block">
        <h2 class="section-title">{{ i18n.t('announcements.title') }}</h2>
        @if (unreadCount > 0) {
          <p class="announcement-unread">{{ i18n.t('announcements.unread', { n: unreadCount }) }}</p>
        }

        <div class="announcement-wrapper" #wrapper>
          <ul class="announcement-list" [class.collapsed]="isCollapsed() && announcements.length > 1">
            @for (announcement of announcements; track announcement.id) {
              <li #cardItem>
                <h3 class="announcement-title">{{ announcement.title }}</h3>
                <p>{{ announcement.message }}</p>
                <small>By {{ announcement.createdBy }} · {{ announcementTimeLabel(announcement.createdAt) }}</small>
              </li>
            }
          </ul>

          @if (announcements.length > 1) {
            <div class="show-all-row" [class.overlay]="isCollapsed()">
              <button
                type="button"
                class="secondary"
                (click)="toggle()"
              >
                {{ isCollapsed() ? i18n.t('announcements.seeMore', { n: announcements.length - 1 }) : i18n.t('announcements.seeLess') }}
              </button>
            </div>
          }
        </div>
      </article>
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .announcement-block {
        margin-top: 2.5rem;
        padding-top: 1.5rem;
        padding-bottom: 2.5rem;
        text-align: center;
      }

      .announcement-unread {
        display: inline-block;
        padding: 0.3rem 0.8rem;
        margin: 0 auto 1rem;
        border-radius: 999px;
        background: #c9b88a;
        color: #4a3f1c;
        font-family: "Montserrat", sans-serif;
        font-size: 0.7rem;
        font-weight: 500;
        letter-spacing: 0.18em;
        text-transform: uppercase;
      }

      .announcement-wrapper {
        position: relative;
        text-align: left;
      }

      .announcement-list {
        list-style: none;
        padding: 0;
        margin: 0;
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }

      .announcement-list.collapsed {
        height: calc(var(--first-h, 0px) + 80px);
        overflow: hidden;
        transition: height 500ms cubic-bezier(0.22, 1, 0.36, 1);
      }

      .announcement-list li {
        position: relative;
        border: 1px solid #d8cfb8;
        background: #faf5ea;
        border-radius: 6px;
        padding: 1.25rem 1.4rem;
        opacity: 1;
        transform: translateY(0) scale(1);
        transform-origin: top center;
        z-index: 1;
        transition:
          margin-top 500ms cubic-bezier(0.22, 1, 0.36, 1),
          opacity 350ms ease,
          transform 500ms cubic-bezier(0.22, 1, 0.36, 1);
      }

      /* Stack/peek: card 2 sits behind card 1 with a small sliver visible at the bottom. */
      .announcement-list.collapsed li:nth-child(2) {
        margin-top: calc(-1 * var(--first-h, 0px) - 20px);
        transform: translateY(0) scale(0.96);
        opacity: 0.55;
        z-index: 0;
        pointer-events: none;
      }

      .announcement-list.collapsed li:nth-child(n+3) {
        margin-top: calc(-1 * var(--first-h, 0px) - 1rem + 8px);
        transform: scale(0.92);
        opacity: 0;
        z-index: -1;
        pointer-events: none;
      }

      .announcement-title {
        margin: 0 0 0.5rem;
        font-family: "Cormorant Garamond", Georgia, serif;
        font-weight: 500;
        font-size: 1.25rem;
        letter-spacing: 0.04em;
        color: #2d2a24;
      }

      .announcement-list p {
        margin: 0.35rem 0;
        color: #5a5347;
      }

      .announcement-list small {
        display: block;
        margin-top: 0.5rem;
        color: #8b8273;
        font-size: 0.78rem;
        letter-spacing: 0.04em;
      }

      .show-all-row {
        display: flex;
        justify-content: flex-end;
        margin-top: 1rem;
      }

      .show-all-row.overlay {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        margin-top: 0;
        padding: 0.5rem 0.75rem;
        z-index: 5;
        pointer-events: none;
      }

      .show-all-row.overlay button {
        pointer-events: auto;
      }
    `
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AnnouncementsPanelComponent implements AfterViewInit, OnDestroy {
  @Input() set announcements(value: AnnouncementInfo[]) {
    this._announcements.set(value ?? []);
  }
  get announcements(): AnnouncementInfo[] {
    return this._announcements();
  }
  @Input() unreadCount = 0;

  @ViewChildren('cardItem') private cardItems?: QueryList<ElementRef<HTMLElement>>;

  private readonly _announcements = signal<AnnouncementInfo[]>([]);
  protected readonly isCollapsed = signal(true);
  protected readonly i18n = inject(I18nService);

  private resizeObserver?: ResizeObserver;
  private observedFirstCard?: HTMLElement;

  constructor(private readonly host: ElementRef<HTMLElement>) {}

  ngAfterViewInit() {
    this.resizeObserver = new ResizeObserver(entries => {
      const entry = entries[0];
      if (!entry) return;
      const height = entry.contentRect.height;
      this.host.nativeElement.style.setProperty('--first-h', `${height}px`);
    });
    this.observeFirstCard();
    this.cardItems?.changes.subscribe(() => this.observeFirstCard());
  }

  ngOnDestroy() {
    this.resizeObserver?.disconnect();
  }

  protected toggle() {
    this.isCollapsed.update(v => !v);
  }

  protected announcementTimeLabel(value: string): string {
    return this.i18n.formatDate(value, { dateStyle: 'medium', timeStyle: 'short' });
  }

  private observeFirstCard() {
    const first = this.cardItems?.first?.nativeElement;
    if (first === this.observedFirstCard) {
      return;
    }
    if (this.observedFirstCard) {
      this.resizeObserver?.unobserve(this.observedFirstCard);
    }
    this.observedFirstCard = first;
    if (first) {
      this.resizeObserver?.observe(first);
    }
  }
}
