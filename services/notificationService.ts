import { pool } from "../config/database.js";

interface NotificationData {
  hospital_id: string;
  type: string;
  title: string;
  message: string;
  related_id?: string;
}

export class NotificationService {
  static async createNotification(data: NotificationData): Promise<string> {
    try {
      const notificationId = `NOTIF_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      await pool.query(
        `INSERT INTO notifications (notification_id, hospital_id, type, title, message, related_id, created_at, is_read)
         VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, false)`,
        [
          notificationId,
          data.hospital_id,
          data.type,
          data.title,
          data.message,
          data.related_id || null,
        ],
      );

      return notificationId;
    } catch (error) {
      console.error("Failed to create notification:", error);
      throw error;
    }
  }

  static async createMatchNotification(
    patientHospitalId: string,
    donorHospitalId: string,
    patientId: string,
    organType: string,
  ): Promise<void> {
    try {
      // Get hospital names
      const hospitalQuery = `SELECT hospital_id, name FROM hospitals WHERE hospital_id IN ($1, $2)`;
      const hospitalResult = await pool.query(hospitalQuery, [
        patientHospitalId,
        donorHospitalId,
      ]);

      const hospitals = hospitalResult.rows.reduce(
        (acc, row) => {
          acc[row.hospital_id] = row.name;
          return acc;
        },
        {} as { [key: string]: string },
      );

      // Notify donor hospital about match request
      await this.createNotification({
        hospital_id: donorHospitalId,
        type: "organ_match",
        title: "New Organ Match Request",
        message: `${hospitals[patientHospitalId]} has requested a ${organType} for patient ${patientId}. Please review and respond.`,
        related_id: patientId,
      });

      console.log(`Match notification sent to hospital ${donorHospitalId}`);
    } catch (error) {
      console.error("Failed to create match notification:", error);
    }
  }

  static async createUrgentCaseNotification(
    hospitalId: string,
    patientId: string,
    patientName: string,
  ): Promise<void> {
    try {
      await this.createNotification({
        hospital_id: hospitalId,
        type: "urgent_case",
        title: "Critical Patient Alert",
        message: `Patient ${patientName} (ID: ${patientId}) condition has been upgraded to critical. Immediate attention required.`,
        related_id: patientId,
      });

      console.log(`Urgent case notification sent to hospital ${hospitalId}`);
    } catch (error) {
      console.error("Failed to create urgent case notification:", error);
    }
  }

  static async createMatchResponseNotification(
    hospitalId: string,
    requestId: string,
    response: "accepted" | "rejected",
    donorHospitalName: string,
  ): Promise<void> {
    try {
      const title =
        response === "accepted"
          ? "Match Request Accepted!"
          : "Match Request Declined";
      const message =
        response === "accepted"
          ? `Your organ request has been accepted by ${donorHospitalName}. Please coordinate with the donor hospital for next steps.`
          : `Your organ request has been declined by ${donorHospitalName}. Continue searching for other matches.`;

      await this.createNotification({
        hospital_id: hospitalId,
        type: "match_response",
        title,
        message,
        related_id: requestId,
      });

      console.log(`Match response notification sent to hospital ${hospitalId}`);
    } catch (error) {
      console.error("Failed to create match response notification:", error);
    }
  }

  static async createSystemNotification(
    hospitalId: string,
    title: string,
    message: string,
  ): Promise<void> {
    try {
      await this.createNotification({
        hospital_id: hospitalId,
        type: "system",
        title,
        message,
      });

      console.log(`System notification sent to hospital ${hospitalId}`);
    } catch (error) {
      console.error("Failed to create system notification:", error);
    }
  }

  static async broadcastToAllHospitals(
    title: string,
    message: string,
    type: string = "system",
  ): Promise<void> {
    try {
      const hospitalQuery = `SELECT hospital_id FROM hospitals WHERE is_active = true`;
      const hospitalResult = await pool.query(hospitalQuery);

      for (const hospital of hospitalResult.rows) {
        await this.createNotification({
          hospital_id: hospital.hospital_id,
          type,
          title,
          message,
        });
      }

      console.log(
        `Broadcast notification sent to ${hospitalResult.rows.length} hospitals`,
      );
    } catch (error) {
      console.error("Failed to broadcast notification:", error);
    }
  }

  // Simulate real-time notifications for demo purposes
  static startDemoNotifications(): void {
    // Send a welcome notification every 2 minutes for demo
    setInterval(async () => {
      try {
        const hospitalQuery = `SELECT hospital_id, name FROM hospitals WHERE is_active = true LIMIT 1`;
        const result = await pool.query(hospitalQuery);

        if (result.rows.length > 0) {
          const hospital = result.rows[0];
          const messages = [
            {
              type: "system",
              title: "System Update",
              message:
                "The AI matching algorithm has been updated with the latest medical research data for improved compatibility scoring.",
            },
            {
              type: "organ_match",
              title: "Potential Match Alert",
              message:
                "A new donor has been registered in the network. Running compatibility checks for your patients.",
            },
            {
              type: "system",
              title: "Monthly Report Available",
              message:
                "Your monthly organ donation statistics report is now available in the Reports section.",
            },
          ];

          const randomMessage =
            messages[Math.floor(Math.random() * messages.length)];

          await this.createNotification({
            hospital_id: hospital.hospital_id,
            ...randomMessage,
          });
        }
      } catch (error) {
        console.error("Demo notification error:", error);
      }
    }, 120000); // Every 2 minutes
  }
}

// Auto-start demo notifications in development
if (process.env.NODE_ENV !== "production") {
  NotificationService.startDemoNotifications();
}

export default NotificationService;
