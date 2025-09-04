import nodemailer from "nodemailer";

// export const sendMail = async ({ to, subject, html }) => {
//   try {
//     const transporter = nodemailer.createTransport({
//       host: process.env.MAIL_HOST,
//       port: process.env.MAIL_PORT,
//       secure: false,
//       auth: {
//         user: process.env.MAIL_USER,
//         pass: process.env.MAIL_PASS,
//       },
//     });

//     await transporter.sendMail({
//       from: `"Moneday" <${process.env.MAIL_USER}>`,
//       to,
//       subject,
//       html,
//     });

//     console.log("📧 Email sent successfully");
//   } catch (error) {
//     console.error("❌ Email failed:", error);
//   }
// };

export const sendMail = async ({ to, subject, html }) => {
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail", // use Gmail service
      auth: {
        user: 'eadelekeife@gmail.com', // your Gmail address
        pass: 'brov yueo ddvt jwzg', // your Gmail App Password
      },
    });

    await transporter.sendMail({
      from: `"Moneday" <${'eadelekeife@gmail.com'}>`,
      to,
      subject,
      html,
    });

    console.log("📧 Email sent successfully");
  } catch (error) {
    console.error("❌ Email failed:", error);
  }
};