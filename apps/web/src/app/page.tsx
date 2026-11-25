import { UserRole, APP_CONSTANTS } from "@commerce/shared";

export default function Home() {
    return (
        <main>
            <h1>Premium E-commerce</h1>
            <p>Role: {UserRole.CUSTOMER}</p>
            <p>API Version: {APP_CONSTANTS.API_VERSION}</p>
        </main>
    );
}
