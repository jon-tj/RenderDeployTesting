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
      @if (bottomImage(); as i) {
        <div class="m bottom" aria-hidden="true">
          <app-event-image [eventId]="ev.id" [imageId]="i.id" [alt]="i.description" />
        </div>
      }
    }
  `,
  styles: [`
    .m { position:fixed; pointer-events:none; z-index:1; }
    .m ::ng-deep img { display:block; width:100%; height:100%; object-fit:contain; }
    .m.left, .m.right { top:50%; transform:translateY(-50%); width:14vw; max-width:200px; height:80vh; max-height:600px; }
    .m.left { left:0; }
    .m.right { right:0; }
    .m.bottom { left:50%; transform:translateX(-50%); bottom:0; width:min(900px, 96vw); height:120px; }
    @media (max-width: 1100px) { .m.left, .m.right { display:none; } }
    @media (max-width: 600px) { .m.bottom { height:80px; } }
  `],
})
export class EventMarginsComponent {
  readonly event = input.required<EventDetail>();

  protected readonly leftImage = computed<EventImage | null>(() =>
    this.event().images.find(i => i.role === 'MarginLeft') ?? null);
  protected readonly rightImage = computed<EventImage | null>(() =>
    this.event().images.find(i => i.role === 'MarginRight') ?? null);
  protected readonly bottomImage = computed<EventImage | null>(() =>
    this.event().images.find(i => i.role === 'MarginBottom') ?? null);
}
