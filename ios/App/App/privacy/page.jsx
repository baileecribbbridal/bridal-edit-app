import styles from "./privacy.module.css";

export const metadata = {
    title: "Privacy Policy",
};

const sections = [
    {
        title: "Information We Collect",
        body: "Placeholder text describing the types of information collected by the app, such as account details, usage data, uploaded content, or information provided through forms.",
    },
    {
        title: "How We Use Information",
        body: "Placeholder text explaining how collected information is used to provide, maintain, personalize, and improve the app experience.",
    },
    {
        title: "Data Storage",
        body: "Placeholder text outlining where and how information is stored, retained, protected, and deleted.",
    },
    {
        title: "Third-Party Services",
        body: "Placeholder text identifying third-party tools, hosting providers, analytics services, payment processors, or integrations that may process information.",
    },
    {
        title: "Contact Information",
        body: "Placeholder text for the email address, mailing address, or support channel users can contact with privacy questions.",
    },
];

export default function PrivacyPage() {
    return (
        <main className={styles.page}>
            <article className={styles.container}>
                <header className={styles.header}>
                    <p className={styles.eyebrow}>Legal</p>
                    <h1>Privacy Policy</h1>
                    <p className={styles.updated}>Last updated: Add date</p>
                </header>

                <div className={styles.sections}>
                    {sections.map((section) => (
                        <section className={styles.section} key={section.title}>
                            <h2>{section.title}</h2>
                            <p>{section.body}</p>
                        </section>
                    ))}
                </div>
            </article>
        </main>
    );
}
