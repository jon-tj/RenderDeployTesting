import { Component, computed, input } from '@angular/core';
import { EventImageComponent } from './event-image.component';
import { EventDetail, EventImage } from '../models';

@Component({
  selector: 'app-event-margins',
  imports: [EventImageComponent],
  template: `
    @if (event(); as ev) {
      @if (leftImage(); as i) {
        <div class="m left" aria-hidden="true">
          <app-event-image [eventId]="ev.id" [imageId]="i.id" [alt]="i.description" />
        </div>
      }
      @if (rightImage(); as i) {
        <div class="m right" aria-hidden="true">
          <app-event-image [eventId]="ev.id" [imageId]="i.id" [alt]="i.description" />
        </div>
      }
    }
  `,
  styles: [`
    .m { position:fixed; pointer-events:none; z-index:1; mix-blend-mode:multiply; }
    .m ::ng-deep img { display:block; width:100%; height:100%; object-fit:contain; mix-blend-mode:multiply; }
    .m.left, .m.right { top:50%; transform:translateY(-50%); width:14vw; max-width:200px; height:80vh; max-height:600px; }
    .m.left { left:0; }
    .m.right { right:0; }
    @media (max-width: 1100px) { .m.left, .m.right { display:none; } }
  `],
})
export class EventMarginsComponent {
  readonly event = input.required<EventDetail>();

  protected readonly leftImage = computed<EventImage | null>(() =>
    this.event().images.find(i => i.role === 'MarginLeft') ?? null);
  protected readonly rightImage = computed<EventImage | null>(() =>
    this.event().images.find(i => i.role === 'MarginRight') ?? null);
}

@Component({
  selector: 'app-event-margin-bottom',
  imports: [EventImageComponent],
  template: `
    @if (event(); as ev) {
      @if (bottomImage(); as i) {
        <div class="b" aria-hidden="true">
          <app-event-image [eventId]="ev.id" [imageId]="i.id" [alt]="i.description" />
        </div>
      }
    }
  `,
  styles: [`
    :host { display:block; }
    .b { display:flex; justify-content:center; margin:1.5rem auto 0; max-width:min(900px, 96vw); mix-blend-mode:multiply; pointer-events:none; }
    .b ::ng-deep img { display:block; max-width:100%; height:auto; mix-blend-mode:multiply; }
  `],
})
export class EventMarginBottomComponent {
  readonly event = input.required<EventDetail>();

  protected readonly bottomImage = computed<EventImage | null>(() =>
    this.event().images.find(i => i.role === 'MarginBottom') ?? null);
}
