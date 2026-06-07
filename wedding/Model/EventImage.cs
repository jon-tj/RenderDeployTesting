using System.ComponentModel.DataAnnotations;

namespace FamilyHub.Model;

public enum ImageRole
{
    // Wide hero image displayed at the top of the event detail page.
    Banner = 0,
    // Photo collection rendered as a carousel on the event detail page.
    Album = 1,
    // Small thumbnail shown beside the event title on the calendar.
    Icon = 2,
    // Decorative accent images anchored to the page edges.
    MarginLeft = 3,
    MarginRight = 4,
    MarginBottom = 5,
}

public class EventImage
{
    public int Id { get; set; }

    public int EventId { get; set; }
    public CalendarEvent? Event { get; set; }

    public ImageRole Role { get; set; }

    [MaxLength(500)]
    public string Description { get; set; } = string.Empty;

    [MaxLength(260)]
    public string FileName { get; set; } = string.Empty;

    [MaxLength(100)]
    public string ContentType { get; set; } = string.Empty;

    // Bytes live in the SQLite DB. Fine for the volumes the hub is aimed at
    // (family-scale); swap for object storage later if galleries get huge.
    public byte[] Data { get; set; } = Array.Empty<byte>();

    public string UploadedById { get; set; } = string.Empty;
    public AppUser? UploadedBy { get; set; }

    public DateTime UploadedAtUtc { get; set; } = DateTime.UtcNow;
}
