/* LAND-SEC-005: Roles */
export function Permissions() {
  return (
    <section className="landing-section" aria-labelledby="roles-title">
      <div className="landing-section__inner">
        <div className="landing-section__header">
          <h2 id="roles-title" className="landing-section__title">Permissions that mean something</h2>
        </div>
        <div className="landing-permissions">
          <div className="landing-roles-scroll">
            <table className="landing-roles-table">
              <caption>Capability matrix for Administrator and Member roles</caption>
              <thead>
                <tr>
                  <th scope="col">Capability</th>
                  <th scope="col">Administrator</th>
                  <th scope="col">Member</th>
                </tr>
              </thead>
              <tbody>
                <tr><td>View team tasks</td><td className="allowed">Allowed</td><td className="allowed">Allowed</td></tr>
                <tr><td>Create tasks and clients</td><td className="allowed">Allowed</td><td className="allowed">Allowed</td></tr>
                <tr><td>Edit any task</td><td className="allowed">Allowed</td><td className="not-allowed">Not allowed</td></tr>
                <tr><td>Edit a task created by another member</td><td className="allowed">Allowed</td><td className="not-allowed">Not allowed</td></tr>
                <tr><td>Edit owned or assigned tasks</td><td className="allowed">Allowed</td><td className="owned-only">Owned only</td></tr>
                <tr><td>Manage users</td><td className="allowed">Allowed</td><td className="not-allowed">Not allowed</td></tr>
                <tr><td>Archive records</td><td className="allowed">Allowed</td><td className="not-allowed">Not allowed</td></tr>
                <tr><td>View task history</td><td className="allowed">Allowed</td><td className="allowed">Allowed</td></tr>
              </tbody>
            </table>
          </div>

          <div className="landing-permissions__evidence">
            <p className="landing-permissions__evidence-label">A member without ownership, tested against the API directly</p>
            <pre className="landing-permissions__request">
              <code>{`PATCH /api/v1/tasks/:id
Member without ownership
→ 404 Resource not found
→ No task or history record changed`}</code>
            </pre>
          </div>
        </div>
        <p className="landing-note landing-note--tight">Permissions are enforced by the API, not only hidden in the interface.</p>
      </div>
    </section>
  )
}
