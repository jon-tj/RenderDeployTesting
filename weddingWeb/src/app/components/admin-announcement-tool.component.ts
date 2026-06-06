import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

interface AnnouncementInfo {
  id: number;
  title: string;
  message: string;
  createdAt: string;
  createdBy: string;
}

@Component({
  selector: 'app-admin-announcement-tool',
  standalone: true,
  template: `
    <article class="admin-tool">
      <label for="announcementTitle">Title</label>
      <input
        id="announcementTitle"
        type="text"
        [value]="announcementTitle"
        (input)="announcementTitle = ($any($event.target).value)"
        placeholder="Important update"
      />

      <label for="announcementMessage">Message</label>
      <textarea
        id="announcementMessage"
        [value]="announcementMessage"
        (input)="announcementMessage = ($any($event.target).value)"
        rows="4"
        placeholder="Write the announcement for all guests"
      ></textarea>

      <div class="actions-row">
        <button type="button" class="primary" (click)="publishAnnouncement()" [disabled]="isWorking">Publish Announcement</button>
      </div>
    </article>
  `,
  styles: [
    `
      :host {
        display: block;
      }
    `
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AdminAnnouncementToolComponent {
  @Input() adminFullName = '';
  @Input() backendBaseUrl = '';

  @Output() announcementsUpdated = new EventEmitter<AnnouncementInfo[]>();
  @Output() statusMessage = new EventEmitter<string>();

  protected announcementTitle = '';
  protected announcementMessage = '';
  protected isWorking = false;

  protected async publishAnnouncement() {
    const title = this.announcementTitle.trim();
    const message = this.announcementMessage.trim();

    if (!title || !message) {
      this.statusMessage.emit('Announcement title and message are required.');
      return;
    }

    this.isWorking = true;
    this.statusMessage.emit('Posting announcement...');

    try {
      const response = await fetch(`${this.backendBaseUrl}/announcements`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          adminFullName: this.adminFullName,
          title,
          message
        })
      });

      if (!response.ok) {
        this.statusMessage.emit('Could not post announcement.');
        return;
      }

      const updatedAnnouncements = (await response.json()) as AnnouncementInfo[];
      this.announcementsUpdated.emit(updatedAnnouncements);
      this.announcementTitle = '';
      this.announcementMessage = '';
      this.statusMessage.emit('Announcement posted (mock email triggered).');
    } catch {
      this.statusMessage.emit('Unable to reach the backend API.');
    } finally {
      this.isWorking = false;
    }
  }
}
