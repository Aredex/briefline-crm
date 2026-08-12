/* LAND-SEC-005: Roles */
export function Permissions() {
  return (
    <section className="landing-section" aria-labelledby="roles-title">
      <div className="landing-section__inner">
        <div className="landing-section__header">
          <h2 id="roles-title" className="landing-section__title">Permissions that mean something</h2>
        </div>
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
              <tr><td>View team tasks</td><td className="yes">Yes</td><td className="yes">Yes</td></tr>
              <tr><td>Create tasks and clients</td><td className="yes">Yes</td><td className="yes">Yes</td></tr>
              <tr><td>Edit any task</td><td className="yes">Yes</td><td className="no">No</td></tr>
              <tr><td>Edit owned or assigned tasks</td><td className="yes">Yes</td><td className="yes">Yes</td></tr>
              <tr><td>Manage users</td><td className="yes">Yes</td><td className="no">No</td></tr>
              <tr><td>Archive records</td><td className="yes">Yes</td><td className="no">No</td></tr>
              <tr><td>View task history</td><td className="yes">Yes</td><td className="yes">Yes</td></tr>
            </tbody>
          </table>
        </div>
        <p className="landing-note landing-note--tight">Permissions are enforced by the API, not only hidden in the interface.</p>
      </div>
    </section>
  )
}
